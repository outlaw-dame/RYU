import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { URL } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  parseMastodonExchangeRequest,
  parseMastodonExchangeResponse,
  parseMastodonRegisterRequest,
  parseMastodonRegisterResponse
} from "../src/auth/contracts";

// ─── Types ───────────────────────────────────────────────────────────────────

type Credentials = {
  clientId: string;
  clientSecret: string;
  scopes: string[];
  updatedAt: string;
};

type SessionPayload = {
  instanceOrigin: string;
  accessToken: string;
  tokenType: string;
  scope?: string;
  account: { id: string; username: string; acct: string; url?: string } | null;
  createdAt: number;
};

type StorePayload = {
  version: 1;
  entries: Record<string, Credentials>;
};

type ConnectNext = (err?: unknown) => void;
export type ConnectHandler = (req: IncomingMessage, res: ServerResponse, next: ConnectNext) => void;

// ─── Validation Schemas ───────────────────────────────────────────────────────

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1).default("Bearer"),
  scope: z.string().optional(),
  expires_in: z.number().int().positive().optional()
});

const appCreateResponseSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  scopes: z.union([z.array(z.string()), z.string()]).optional()
});

const accountResponseSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  acct: z.string().min(1),
  url: z.string().url().optional()
});

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_BODY_BYTES = 24 * 1024;
const STORE_PATH = resolve(process.cwd(), ".data/mastodon-credentials.enc");
const DEV_KEY_PATH = resolve(process.cwd(), ".data/dev-store-key.hex");
const SESSION_COOKIE = "ryu_masto_session";
const SESSION_MAX_AGE_SECONDS = 2_592_000; // 30 days
// Domain strings for key derivation — changing these invalidates all stored data.
const CREDENTIAL_CONTEXT = "ryu:credentials:v1";
const SESSION_CONTEXT = "ryu:session:v1";

// ─── Key Management ───────────────────────────────────────────────────────────

async function resolveStoreKey(): Promise<string> {
  if (process.env.MASTODON_CLIENT_STORE_KEY) {
    return process.env.MASTODON_CLIENT_STORE_KEY;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("MASTODON_CLIENT_STORE_KEY must be set in production");
  }

  // Development: generate once and persist so credentials survive server restarts.
  try {
    return (await readFile(DEV_KEY_PATH, "utf8")).trim();
  } catch {
    const key = randomBytes(32).toString("hex");
    await mkdir(dirname(DEV_KEY_PATH), { recursive: true });
    await writeFile(DEV_KEY_PATH, key, "utf8");
    console.warn(`[ryu:auth] Dev store key written to ${DEV_KEY_PATH} — set MASTODON_CLIENT_STORE_KEY before deploying.`);
    return key;
  }
}

function toKeyMaterial(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

// Derive independent subkeys so credential and session ciphertexts use distinct keys.
function deriveSubkey(master: Buffer, context: string): Buffer {
  return createHash("sha256").update(master).update(context).digest();
}

// ─── AES-256-GCM Crypto ───────────────────────────────────────────────────────

function encryptJson(payload: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((b) => b.toString("base64url")).join(".");
}

function decryptJson(payload: string, key: Buffer): string {
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("Malformed encrypted payload");
  const [ivB64, tagB64, ciphertextB64] = parts as [string, string, string];
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

async function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function drainBody(req: IncomingMessage): Promise<void> {
  return new Promise((resolve) => {
    if (req.readableEnded || req.destroyed) { resolve(); return; }
    req.on("end", resolve);
    req.on("error", resolve);
    req.resume();
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.writableEnded) return;
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

function clientAddress(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  if (Array.isArray(forwarded)) {
    const first = forwarded[0]?.split(",")[0]?.trim();
    if (first) return first;
  }

  return req.socket.remoteAddress ?? "unknown";
}

// ─── Cookie Helpers ───────────────────────────────────────────────────────────

function isSecureConnection(req: IncomingMessage): boolean {
  return req.headers["x-forwarded-proto"] === "https" ||
    Boolean((req.socket as { encrypted?: boolean }).encrypted);
}

function setSessionCookie(req: IncomingMessage, res: ServerResponse, token: string): void {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`
  ];
  if (isSecureConnection(req)) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(req: IncomingMessage, res: ServerResponse): void {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];
  if (isSecureConnection(req)) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function readCookie(req: IncomingMessage, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const entry of raw.split(";")) {
    const eq = entry.indexOf("=");
    if (eq < 0) continue;
    if (entry.slice(0, eq).trim() === name) {
      return decodeURIComponent(entry.slice(eq + 1).trim());
    }
  }
  return null;
}

// ─── Rate Limiter ─────────────────────────────────────────────────────────────

function createRateLimiter(limitPerMinute: number): (ip: string) => boolean {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  let lastCleanAt = Date.now();

  return (ip: string) => {
    const now = Date.now();

    // Evict expired buckets every 5 minutes to prevent unbounded growth.
    if (now - lastCleanAt > 300_000) {
      for (const [key, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(key);
      }
      lastCleanAt = now;
    }

    const bucket = buckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(ip, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    if (bucket.count >= limitPerMinute) return false;
    bucket.count += 1;
    return true;
  };
}

// ─── Network / SSRF Guards ────────────────────────────────────────────────────

function isPrivateAddress(hostname: string): boolean {
  // Block loopback IPs, RFC1918, link-local, and unspecified — but NOT the
  // "localhost" hostname which is intentionally allowed for dev/testing.
  return (
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^fc[0-9a-f]{2}:/i.test(hostname) ||
    /^fd[0-9a-f]{2}:/i.test(hostname) ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "::"
  );
}

function normalizeOrigin(input: string): string {
  const parsed = new URL(input);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("Only HTTPS origins are allowed");
  }
  if (isPrivateAddress(parsed.hostname)) {
    throw new Error("Instance origin must not be a private network address");
  }
  return `${parsed.protocol}//${parsed.host}`;
}

function sanitizeUpstreamError(text: string): string {
  return text.slice(0, 400).replace(/[\r\n\t]+/g, " ").trim();
}

// Exponential backoff with full jitter; cap at 8 s.
function backoffMs(attempt: number): number {
  return Math.min(8_000, 200 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200));
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (response.ok) return response;

      const retryable = response.status === 408 || response.status === 425 ||
        response.status === 429 || response.status >= 500;
      if (retryable && attempt < attempts) {
        await new Promise<void>((r) => setTimeout(r, backoffMs(attempt)));
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts) {
        await new Promise<void>((r) => setTimeout(r, backoffMs(attempt)));
      }
    }
  }

  throw lastError ?? new Error("Network request failed");
}

// ─── Credential Store ─────────────────────────────────────────────────────────

class CredentialStore {
  private readonly keyPromise: Promise<Buffer>;
  private loadPromise: Promise<void> | null = null;
  // Serialized write queue prevents concurrent persist() calls from racing.
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly entries = new Map<string, Credentials>();

  constructor(keyPromise: Promise<Buffer>) {
    this.keyPromise = keyPromise;
  }

  private loadOnce(): Promise<void> {
    // Promise singleton: only one load regardless of concurrent callers.
    if (!this.loadPromise) this.loadPromise = this.load();
    return this.loadPromise;
  }

  private async load(): Promise<void> {
    const key = await this.keyPromise;
    try {
      const encrypted = await readFile(STORE_PATH, "utf8");
      const payload = JSON.parse(decryptJson(encrypted.trim(), key)) as StorePayload;
      if (payload.version !== 1) return;
      for (const [origin, creds] of Object.entries(payload.entries)) {
        this.entries.set(origin, creds);
      }
    } catch {
      // Expected on first run; any decryption failures also land here safely.
    }
  }

  private async persist(): Promise<void> {
    const key = await this.keyPromise;
    const payload: StorePayload = { version: 1, entries: Object.fromEntries(this.entries) };
    const encrypted = encryptJson(JSON.stringify(payload), key);
    await mkdir(dirname(STORE_PATH), { recursive: true });
    // Use hrtime for tmp suffix to prevent collision between rapid concurrent writes.
    const tmp = `${STORE_PATH}.${process.hrtime.bigint()}.tmp`;
    await writeFile(tmp, encrypted, "utf8");
    await rename(tmp, STORE_PATH);
  }

  async get(instanceOrigin: string): Promise<Credentials | undefined> {
    await this.loadOnce();
    return this.entries.get(instanceOrigin);
  }

  async set(instanceOrigin: string, credentials: Credentials): Promise<void> {
    await this.loadOnce();
    this.entries.set(instanceOrigin, credentials);
    // Chain onto the write queue; allow the queue to continue even if this write fails.
    const write = this.writeQueue.then(() => this.persist());
    this.writeQueue = write.catch(() => {});
    await write; // propagate the error to the caller
  }
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

async function handleSession(
  req: IncomingMessage,
  res: ServerResponse,
  sessKey: Buffer
): Promise<void> {
  const raw = readCookie(req, SESSION_COOKIE);
  if (!raw) {
    sendJson(res, 200, { connected: false });
    return;
  }

  try {
    const session = JSON.parse(decryptJson(raw, sessKey)) as SessionPayload;

    // Server-side age check as defence-in-depth against replayed cookies.
    if (Date.now() - session.createdAt > SESSION_MAX_AGE_SECONDS * 1000) {
      clearSessionCookie(req, res);
      sendJson(res, 200, { connected: false });
      return;
    }

    sendJson(res, 200, {
      connected: true,
      instanceOrigin: session.instanceOrigin,
      account: session.account ?? null,
      scope: session.scope ?? null
    });
  } catch {
    // Tampered or key-rotated cookie — clear it and report disconnected.
    clearSessionCookie(req, res);
    sendJson(res, 200, { connected: false });
  }
}

async function handleRegister(
  res: ServerResponse,
  body: unknown,
  store: CredentialStore
): Promise<void> {
  const parsed = parseMastodonRegisterRequest(body);
  const instanceOrigin = normalizeOrigin(parsed.instanceOrigin);

  const response = await fetchWithRetry(`${instanceOrigin}/api/v1/apps`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: parsed.clientName ?? "Ryu",
      redirect_uris: parsed.redirectUris,
      scopes: parsed.scopes.join(" "),
      website: parsed.website
    })
  });

  if (!response.ok) {
    sendJson(res, response.status, {
      error: "register_failed",
      message: sanitizeUpstreamError(await response.text())
    });
    return;
  }

  const created = appCreateResponseSchema.parse(await response.json());
  const scopes = Array.isArray(created.scopes)
    ? created.scopes
    : typeof created.scopes === "string"
    ? created.scopes.split(/\s+/).filter(Boolean)
    : parsed.scopes;

  await store.set(instanceOrigin, {
    clientId: created.client_id,
    clientSecret: created.client_secret,
    scopes,
    updatedAt: new Date().toISOString()
  });

  sendJson(res, 200, parseMastodonRegisterResponse({
    clientId: created.client_id,
    instanceOrigin,
    scopes
  }));
}

async function handleExchange(
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  store: CredentialStore,
  sessKey: Buffer
): Promise<void> {
  const parsed = parseMastodonExchangeRequest(body);
  const instanceOrigin = normalizeOrigin(parsed.instanceOrigin);
  const credentials = await store.get(instanceOrigin);

  if (!credentials) {
    sendJson(res, 404, {
      error: "credentials_not_found",
      message: "No registered app credentials found for this instance. Register the app first."
    });
    return;
  }

  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    redirect_uri: parsed.redirectUri,
    code: parsed.code,
    code_verifier: parsed.codeVerifier
  });

  const tokenResponse = await fetchWithRetry(`${instanceOrigin}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: tokenBody.toString()
  });

  if (!tokenResponse.ok) {
    sendJson(res, tokenResponse.status, {
      error: "exchange_failed",
      message: sanitizeUpstreamError(await tokenResponse.text())
    });
    return;
  }

  const token = tokenResponseSchema.parse(await tokenResponse.json());

  let account: z.infer<typeof accountResponseSchema> | null = null;
  try {
    const accountResponse = await fetchWithRetry(
      `${instanceOrigin}/api/v1/accounts/verify_credentials`,
      { headers: { Authorization: `${token.token_type} ${token.access_token}`, Accept: "application/json" } }
    );
    if (accountResponse.ok) {
      account = accountResponseSchema.parse(await accountResponse.json());
    }
  } catch {
    // verify_credentials is best-effort and must not block a successful exchange.
  }

  const sessionPayload: SessionPayload = {
    instanceOrigin,
    accessToken: token.access_token,
    tokenType: token.token_type,
    scope: token.scope,
    account,
    createdAt: Date.now()
  };
  setSessionCookie(req, res, encryptJson(JSON.stringify(sessionPayload), sessKey));

  sendJson(res, 200, parseMastodonExchangeResponse({
    connected: true,
    instanceOrigin,
    scope: token.scope,
    tokenType: token.token_type,
    account: account ?? undefined,
    expiresAt: token.expires_in != null ? Date.now() + token.expires_in * 1000 : null
  }));
}

async function handleRevoke(
  req: IncomingMessage,
  res: ServerResponse,
  store: CredentialStore,
  sessKey: Buffer
): Promise<void> {
  // Drain body without parsing; revoke is cookie-driven.
  await drainBody(req);

  const raw = readCookie(req, SESSION_COOKIE);
  // Clear locally first so the user is signed out regardless of upstream outcome.
  clearSessionCookie(req, res);

  if (!raw) {
    sendJson(res, 200, { revoked: true });
    return;
  }

  try {
    const session = JSON.parse(decryptJson(raw, sessKey)) as SessionPayload;
    const credentials = await store.get(normalizeOrigin(session.instanceOrigin));

    if (credentials) {
      await fetchWithRetry(`${session.instanceOrigin}/oauth/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          token: session.accessToken
        }).toString()
      });
    }
  } catch {
    // Stale, tampered, or key-rotated cookie — local clear already succeeded.
  }

  sendJson(res, 200, { revoked: true });
}

// ─── Request Dispatcher ───────────────────────────────────────────────────────

async function dispatch(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  store: CredentialStore,
  sessKeyPromise: Promise<Buffer>
): Promise<void> {
  try {
    // Resolve session key once; used by session, exchange, and revoke handlers.
    const sessKey = await sessKeyPromise;

    if (url.pathname === "/api/auth/mastodon/session") {
      if (req.method !== "GET" && req.method !== "HEAD") {
        sendJson(res, 405, { error: "method_not_allowed" });
        return;
      }
      await handleSession(req, res, sessKey);
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return;
    }

    if (url.pathname === "/api/auth/mastodon/revoke") {
      await handleRevoke(req, res, store, sessKey);
      return;
    }

    // JSON body endpoints: enforce Content-Type before reading body.
    const contentType = req.headers["content-type"] ?? "";
    if (!contentType.includes("application/json")) {
      sendJson(res, 415, { error: "unsupported_media_type", message: "Content-Type must be application/json" });
      return;
    }

    const bodyRaw = await readRequestBody(req);
    const body: unknown = bodyRaw ? JSON.parse(bodyRaw) : {};

    if (url.pathname === "/api/auth/mastodon/register") {
      await handleRegister(res, body, store);
      return;
    }

    if (url.pathname === "/api/auth/mastodon/exchange") {
      await handleExchange(req, res, body, store, sessKey);
      return;
    }

    sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    if (!res.writableEnded) {
      const message = error instanceof Error ? error.message.slice(0, 200) : "Request error";
      sendJson(res, 400, { error: "invalid_request", message });
    }
  }
}

// ─── Middleware Factory ───────────────────────────────────────────────────────

export function createMastodonAuthMiddleware(): ConnectHandler {
  const masterKeyPromise = resolveStoreKey().then(toKeyMaterial);
  const credKeyPromise = masterKeyPromise.then((k) => deriveSubkey(k, CREDENTIAL_CONTEXT));
  const sessKeyPromise = masterKeyPromise.then((k) => deriveSubkey(k, SESSION_CONTEXT));

  // Surface key resolution errors early so they appear at startup, not first request.
  masterKeyPromise.catch((err: unknown) => {
    console.error("[ryu:auth] Key resolution failed:", err instanceof Error ? err.message : String(err));
  });

  const store = new CredentialStore(credKeyPromise);
  const allowRequest = createRateLimiter(80);

  return (req, res, next) => {
    if (!req.url) { next(); return; }

    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/auth/mastodon/")) { next(); return; }

    const ip = clientAddress(req);
    if (!allowRequest(ip)) {
      sendJson(res, 429, { error: "rate_limited", message: "Too many requests" });
      return;
    }

    // CSRF guard: if an Origin header is present it must match the Host.
    const originHeader = req.headers.origin;
    if (originHeader) {
      try {
        const parsed = new URL(originHeader);
        if (parsed.host !== (req.headers.host ?? "")) {
          sendJson(res, 403, { error: "forbidden_origin" });
          return;
        }
      } catch {
        sendJson(res, 403, { error: "forbidden_origin" });
        return;
      }
    }

    void dispatch(req, res, url, store, sessKeyPromise);
  };
}
