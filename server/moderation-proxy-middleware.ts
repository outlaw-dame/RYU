import { createDecipheriv, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { normalizeDomain } from "../src/moderation/domain-block-store";

const SESSION_COOKIE = "ryu_masto_session";
const SESSION_CONTEXT = "ryu:session:v1";
const SESSION_MAX_AGE_MS = 2_592_000 * 1000;
const DEV_KEY_PATH = resolve(process.cwd(), ".data/dev-store-key.hex");
const MAX_BODY_BYTES = 24 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const sessionSchema = z.object({
  instanceOrigin: z.string().url(),
  accessToken: z.string().min(1),
  tokenType: z.string().min(1),
  account: z.object({ id: z.string().min(1) }).passthrough().nullable(),
  createdAt: z.number().finite()
}).passthrough();

const accountIdSchema = z.string().trim().min(1).max(128).regex(/^[\w-]+$/);
const domainSchema = z.string().trim().min(1).max(253).transform((value, context) => {
  const normalized = normalizeDomain(value);
  if (!normalized) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid domain" });
    return z.NEVER;
  }
  return normalized;
});
const filterContextSchema = z.enum(["home", "notifications", "public", "thread", "account"]);
const createFilterSchema = z.object({
  title: z.string().trim().min(1).max(200),
  context: z.array(filterContextSchema).min(1).max(5),
  filter_action: z.enum(["warn", "hide"]),
  expires_in: z.number().int().positive().max(31_536_000).optional(),
  keywords_attributes: z.array(z.object({
    keyword: z.string().trim().min(1).max(200),
    whole_word: z.boolean().default(false)
  })).min(1).max(20)
});

const ACTION_ROUTES = new Map<string, { upstream: string; schema: z.ZodTypeAny }>([
  ["mute", { upstream: "mute", schema: z.object({ accountId: accountIdSchema, notifications: z.boolean().optional(), duration: z.number().int().positive().max(31_536_000).optional() }) }],
  ["unmute", { upstream: "unmute", schema: z.object({ accountId: accountIdSchema }) }],
  ["block", { upstream: "block", schema: z.object({ accountId: accountIdSchema }) }],
  ["unblock", { upstream: "unblock", schema: z.object({ accountId: accountIdSchema }) }]
]);

export type ConnectNext = (error?: unknown) => void;
export type ConnectHandler = (req: IncomingMessage, res: ServerResponse, next: ConnectNext) => void;

type Session = z.infer<typeof sessionSchema>;

export function createModerationProxyMiddleware(): ConnectHandler {
  const sessionKeyPromise = resolveSessionKey();
  const allowWrite = createRateLimiter(20);

  return (req, res, next) => {
    if (!req.url) { next(); return; }
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/auth/mastodon/moderation/")) { next(); return; }

    void handle(req, res, url, sessionKeyPromise, allowWrite).catch(() => {
      sendJson(res, 500, { error: "moderation_proxy_error" });
    });
  };
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  keyPromise: Promise<Buffer>,
  allowWrite: (key: string) => boolean
): Promise<void> {
  const session = await readSession(req, await keyPromise);
  if (!session) {
    await drainBody(req);
    sendJson(res, 401, { error: "not_authenticated" });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD" && !allowWrite(clientAddress(req))) {
    await drainBody(req);
    sendJson(res, 429, { error: "rate_limited" });
    return;
  }

  const suffix = url.pathname.slice("/api/auth/mastodon/moderation/".length);
  if (req.method === "GET" || req.method === "HEAD") {
    const upstreamPath = readUpstreamPath(suffix, url);
    if (!upstreamPath) { sendJson(res, 404, { error: "not_found" }); return; }
    await proxy(session, res, upstreamPath, { method: "GET" });
    return;
  }

  if (req.method === "POST" && ACTION_ROUTES.has(suffix)) {
    const route = ACTION_ROUTES.get(suffix)!;
    const body = route.schema.parse(await readJsonBody(req));
    const accountId = body.accountId as string;
    const upstreamBody = suffix === "mute"
      ? JSON.stringify({ notifications: body.notifications ?? true, ...(body.duration ? { duration: body.duration } : {}) })
      : undefined;
    await proxy(session, res, `/api/v1/accounts/${encodeURIComponent(accountId)}/${route.upstream}`, {
      method: "POST",
      headers: upstreamBody ? { "Content-Type": "application/json" } : undefined,
      body: upstreamBody
    });
    return;
  }

  if (req.method === "POST" && suffix === "domain-block") {
    const { domain } = z.object({ domain: domainSchema }).parse(await readJsonBody(req));
    await proxy(session, res, "/api/v1/domain_blocks", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ domain }).toString()
    });
    return;
  }

  if (req.method === "POST" && suffix === "domain-unblock") {
    const { domain } = z.object({ domain: domainSchema }).parse(await readJsonBody(req));
    await proxy(session, res, `/api/v1/domain_blocks?domain=${encodeURIComponent(domain)}`, { method: "DELETE" });
    return;
  }

  if (req.method === "POST" && suffix === "filters") {
    const body = createFilterSchema.parse(await readJsonBody(req));
    await proxy(session, res, "/api/v2/filters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return;
  }

  const filterDelete = /^filters\/([\w-]{1,128})$/.exec(suffix);
  if (req.method === "DELETE" && filterDelete) {
    await drainBody(req);
    await proxy(session, res, `/api/v2/filters/${encodeURIComponent(filterDelete[1]!)}`, { method: "DELETE" });
    return;
  }

  await drainBody(req);
  sendJson(res, 405, { error: "method_not_allowed" });
}

function readUpstreamPath(suffix: string, url: URL): string | null {
  switch (suffix) {
    case "mutes": return copyPagination("/api/v1/mutes", url);
    case "blocks": return copyPagination("/api/v1/blocks", url);
    case "domain-blocks": return copyPagination("/api/v1/domain_blocks", url);
    case "filters": return "/api/v2/filters";
    case "relationships": {
      const ids = url.searchParams.getAll("id[]").filter((id) => accountIdSchema.safeParse(id).success).slice(0, 100);
      if (ids.length === 0) return null;
      const params = new URLSearchParams();
      ids.forEach((id) => params.append("id[]", id));
      return `/api/v1/accounts/relationships?${params.toString()}`;
    }
    default: return null;
  }
}

function copyPagination(path: string, url: URL): string {
  const params = new URLSearchParams();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 80, 1), 80);
  params.set("limit", String(limit));
  for (const key of ["max_id", "since_id", "min_id"] as const) {
    const value = url.searchParams.get(key);
    if (value && /^[\w-]{1,128}$/.test(value)) params.set(key, value);
  }
  return `${path}?${params.toString()}`;
}

async function proxy(session: Session, res: ServerResponse, path: string, init: RequestInit): Promise<void> {
  const upstream = new URL(path, session.instanceOrigin);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `${session.tokenType} ${session.accessToken}`);

  const response = await fetch(upstream, { ...init, headers, redirect: "error" });
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_RESPONSE_BYTES) {
    sendJson(res, 502, { error: "upstream_response_too_large" });
    return;
  }

  res.statusCode = response.status;
  res.setHeader("Cache-Control", "no-store");
  const contentType = response.headers.get("content-type");
  if (contentType) res.setHeader("Content-Type", contentType);
  if (response.status === 204 || init.method === "HEAD") res.end();
  else res.end(body);
}

async function resolveSessionKey(): Promise<Buffer> {
  const secret = process.env.MASTODON_CLIENT_STORE_KEY
    ?? (process.env.NODE_ENV === "production" ? "" : await readFile(DEV_KEY_PATH, "utf8").then((value) => value.trim()).catch(() => ""));
  if (!secret) throw new Error("Mastodon session key unavailable");
  const master = createHash("sha256").update(secret).digest();
  return createHash("sha256").update(master).update(SESSION_CONTEXT).digest();
}

async function readSession(req: IncomingMessage, key: Buffer): Promise<Session | null> {
  const raw = readCookie(req, SESSION_COOKIE);
  if (!raw) return null;
  try {
    const [iv, tag, encrypted] = raw.split(".");
    if (!iv || !tag || !encrypted) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
    const session = sessionSchema.parse(JSON.parse(plaintext));
    if (Date.now() - session.createdAt > SESSION_MAX_AGE_MS) return null;
    const origin = new URL(session.instanceOrigin);
    if (origin.protocol !== "https:" && !(origin.protocol === "http:" && isLoopback(origin.hostname))) return null;
    return session;
  } catch {
    return null;
  }
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function readCookie(req: IncomingMessage, name: string): string | null {
  for (const entry of (req.headers.cookie ?? "").split(";")) {
    const [key, ...rest] = entry.split("=");
    if (key?.trim() === name) return decodeURIComponent(rest.join("=").trim());
  }
  return null;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  if (!(req.headers["content-type"] ?? "").includes("application/json")) {
    await drainBody(req);
    throw new Error("Content-Type must be application/json");
  }
  return JSON.parse(await readBody(req));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) { reject(new Error("Request body too large")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function drainBody(req: IncomingMessage): Promise<void> {
  return new Promise((resolveDrain) => {
    if (req.readableEnded || req.destroyed) { resolveDrain(); return; }
    req.on("end", resolveDrain);
    req.on("error", resolveDrain);
    req.resume();
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function clientAddress(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
}

function createRateLimiter(limit: number): (key: string) => boolean {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (key) => {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) { buckets.set(key, { count: 1, resetAt: now + 60_000 }); return true; }
    if (bucket.count >= limit) return false;
    bucket.count += 1;
    return true;
  };
}
