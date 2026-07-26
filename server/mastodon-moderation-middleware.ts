import { createDecipheriv, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";

const PREFIX = "/api/auth/mastodon/moderation";
const COOKIE = "ryu_masto_session";
const SESSION_CONTEXT = "ryu:session:v1";
const DEV_KEY_PATH = resolve(process.cwd(), ".data/dev-store-key.hex");
const MAX_BODY = 24 * 1024;
const MAX_PAGES = 20;

type Session = {
  instanceOrigin: string;
  accessToken: string;
  tokenType: string;
  createdAt: number;
};

const accountBody = z.object({ accountId: z.string().trim().min(1).max(2_048), notifications: z.boolean().optional(), duration: z.number().int().min(0).max(31_536_000).optional() });
const domainBody = z.object({ domain: z.string().trim().min(1).max(253) });
const filterCreateBody = z.object({
  filterId: z.string().trim().min(1).max(2_048),
  phrase: z.string().trim().min(1).max(2_048),
  wholeWord: z.boolean().optional(),
  action: z.enum(["hide", "warn", "blur"]).optional(),
  duration: z.number().int().min(0).max(31_536_000).optional()
});
const filterDeleteBody = z.object({ remoteFilterId: z.string().trim().min(1).max(2_048) });

function send(res: ServerResponse, status: number, payload: unknown, headers?: Headers): void {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const retryAfter = headers?.get("Retry-After");
  if (retryAfter) res.setHeader("Retry-After", retryAfter);
  res.end(JSON.stringify(payload));
}

function cookie(req: IncomingMessage): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index >= 0 && part.slice(0, index).trim() === COOKIE) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

async function sessionKey(): Promise<Buffer> {
  const secret = process.env.MASTODON_CLIENT_STORE_KEY ?? (await readFile(DEV_KEY_PATH, "utf8")).trim();
  const master = createHash("sha256").update(secret).digest();
  return createHash("sha256").update(master).update(SESSION_CONTEXT).digest();
}

async function readSession(req: IncomingMessage): Promise<Session | null> {
  const value = cookie(req);
  if (!value) return null;
  try {
    const [iv, tag, ciphertext] = value.split(".");
    if (!iv || !tag || !ciphertext) return null;
    const decipher = createDecipheriv("aes-256-gcm", await sessionKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const text = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(text) as Session;
    if (!parsed.instanceOrigin || !parsed.accessToken || Date.now() - parsed.createdAt > 2_592_000_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const host = new URL(origin).host.toLowerCase();
    const candidates = [req.headers.host, req.headers["x-forwarded-host"], req.headers["x-original-host"]]
      .flatMap((value) => Array.isArray(value) ? value : value ? [value] : [])
      .flatMap((value) => value.split(","))
      .map((value) => value.trim().toLowerCase());
    return candidates.includes(host);
  } catch { return false; }
}

async function body(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error("body_too_large")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new Error("invalid_json")); }
    });
    req.on("error", reject);
  });
}

function auth(session: Session): HeadersInit {
  return { Accept: "application/json", Authorization: `${session.tokenType || "Bearer"} ${session.accessToken}` };
}

async function upstream(session: Session, path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const headers = new Headers(init.headers);
    for (const [key, value] of Object.entries(auth(session))) headers.set(key, value);
    return await fetch(new URL(path, session.instanceOrigin), { ...init, headers, signal: controller.signal });
  } finally { clearTimeout(timer); }
}

async function relay(res: ServerResponse, response: Response, successPayload?: unknown): Promise<void> {
  if (!response.ok) {
    send(res, response.status, { error: response.status === 401 || response.status === 403 ? "mastodon_auth_failed" : "mastodon_request_failed" }, response.headers);
    return;
  }
  if (successPayload !== undefined) { send(res, 200, successPayload); return; }
  const contentType = response.headers.get("content-type") ?? "";
  send(res, 200, contentType.includes("application/json") ? await response.json() : { ok: true });
}

async function fetchAll(session: Session, path: string): Promise<unknown[]> {
  const items: unknown[] = [];
  let next: URL | null = new URL(path, session.instanceOrigin);
  for (let page = 0; next && page < MAX_PAGES; page += 1) {
    const response = await upstream(session, next.pathname + next.search);
    if (!response.ok) throw Object.assign(new Error("upstream"), { response });
    const value: unknown = await response.json();
    if (!Array.isArray(value)) throw new Error("invalid_upstream");
    items.push(...value);
    const link = response.headers.get("Link")?.split(",").find((part) => /rel="?next"?/.test(part));
    const match = link?.match(/<([^>]+)>/);
    next = match ? new URL(match[1], session.instanceOrigin) : null;
    if (next && next.origin !== new URL(session.instanceOrigin).origin) throw new Error("cross_origin_pagination");
  }
  return items;
}

export type ConnectNext = (error?: unknown) => void;
export type ConnectHandler = (req: IncomingMessage, res: ServerResponse, next: ConnectNext) => void;

export function createMastodonModerationMiddleware(): ConnectHandler {
  return (req, res, next) => {
    if (!req.url) { next(); return; }
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith(PREFIX)) { next(); return; }

    void (async () => {
      if (!originAllowed(req)) { send(res, 403, { error: "forbidden_origin" }); return; }
      const session = await readSession(req);
      if (!session) { send(res, 401, { error: "not_authenticated" }); return; }

      try {
        if (url.pathname === `${PREFIX}/state`) {
          if (req.method !== "GET" && req.method !== "HEAD") { send(res, 405, { error: "method_not_allowed" }); return; }
          const [mutes, blocks, domains, filters] = await Promise.all([
            fetchAll(session, "/api/v1/mutes?limit=80"), fetchAll(session, "/api/v1/blocks?limit=80"),
            fetchAll(session, "/api/v1/domain_blocks?limit=80"), fetchAll(session, "/api/v2/filters?limit=80")
          ]);
          send(res, 200, { mutes, blocks, domains, filters });
          return;
        }

        if (req.method !== "POST" || !(req.headers["content-type"] ?? "").includes("application/json")) {
          send(res, req.method === "POST" ? 415 : 405, { error: req.method === "POST" ? "unsupported_media_type" : "method_not_allowed" });
          return;
        }
        const raw = await body(req);

        if (url.pathname === `${PREFIX}/mute` || url.pathname === `${PREFIX}/unmute` || url.pathname === `${PREFIX}/block` || url.pathname === `${PREFIX}/unblock`) {
          const parsed = accountBody.parse(raw);
          const action = url.pathname.slice(PREFIX.length + 1);
          const payload = action === "mute" ? { notifications: parsed.notifications ?? true, duration: parsed.duration } : undefined;
          await relay(res, await upstream(session, `/api/v1/accounts/${encodeURIComponent(parsed.accountId)}/${action}`, {
            method: "POST", headers: payload ? { "Content-Type": "application/json" } : undefined, body: payload ? JSON.stringify(payload) : undefined
          }));
          return;
        }

        if (url.pathname === `${PREFIX}/domain-block` || url.pathname === `${PREFIX}/domain-unblock`) {
          const parsed = domainBody.parse(raw);
          const form = new URLSearchParams({ domain: parsed.domain });
          await relay(res, await upstream(session, "/api/v1/domain_blocks", {
            method: url.pathname.endsWith("unblock") ? "DELETE" : "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString()
          }), { ok: true });
          return;
        }

        if (url.pathname === `${PREFIX}/filters`) {
          const parsed = filterCreateBody.parse(raw);
          const response = await upstream(session, "/api/v2/filters", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: parsed.phrase.slice(0, 100), context: ["home", "notifications", "public", "thread", "account"], filter_action: parsed.action === "warn" ? "warn" : "hide", expires_in: parsed.duration, keywords_attributes: [{ keyword: parsed.phrase, whole_word: parsed.wholeWord ?? false }] })
          });
          if (!response.ok) { await relay(res, response); return; }
          const created = await response.json() as { id?: unknown };
          if (typeof created.id !== "string" || !created.id) { send(res, 502, { error: "invalid_upstream" }); return; }
          send(res, 200, { localFilterId: parsed.filterId, remoteFilterId: created.id });
          return;
        }

        if (url.pathname === `${PREFIX}/filters/delete`) {
          const parsed = filterDeleteBody.parse(raw);
          await relay(res, await upstream(session, `/api/v2/filters/${encodeURIComponent(parsed.remoteFilterId)}`, { method: "DELETE" }), { ok: true });
          return;
        }

        send(res, 404, { error: "not_found" });
      } catch (error) {
        const upstreamResponse = (error as { response?: Response }).response;
        if (upstreamResponse) { await relay(res, upstreamResponse); return; }
        send(res, error instanceof z.ZodError ? 400 : 502, { error: error instanceof z.ZodError ? "invalid_request" : "moderation_proxy_error" });
      }
    })();
  };
}
