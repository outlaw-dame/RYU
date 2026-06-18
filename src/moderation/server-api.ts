/**
 * Phase 35 - Moderation server API.
 *
 * Communicates with the user's Mastodon/BookWyrm instance through the
 * backend proxy at /api/auth/mastodon/* to sync moderation state.
 *
 * Endpoints:
 * - GET /api/v1/mutes -> proxied as /api/auth/mastodon/mutes
 * - POST /api/v1/accounts/:id/mute -> proxied as /api/auth/mastodon/accounts/:id/mute
 * - POST /api/v1/accounts/:id/unmute -> proxied as /api/auth/mastodon/accounts/:id/unmute
 * - GET /api/v1/blocks -> proxied as /api/auth/mastodon/blocks
 * - POST /api/v1/accounts/:id/block -> proxied as /api/auth/mastodon/accounts/:id/block
 * - POST /api/v1/accounts/:id/unblock -> proxied as /api/auth/mastodon/accounts/:id/unblock
 * - GET /api/v1/domain_blocks -> proxied as /api/auth/mastodon/domain_blocks
 * - POST /api/v1/domain_blocks -> proxied as /api/auth/mastodon/domain_blocks
 * - DELETE /api/v1/domain_blocks -> proxied as /api/auth/mastodon/domain_blocks
 */

export type ModerationServerApiOptions = {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type ServerAccount = {
  id: string;
  acct: string;
  username?: string;
  display_name?: string;
  url?: string;
};

export class ModerationServerApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

const PROXY_BASE = "/api/auth/mastodon";

/**
 * Validate an account ID to prevent path traversal.
 */
function validateAccountId(id: string): string {
  const safe = id.trim();
  if (!safe || !/^[\w-]{1,64}$/.test(safe)) {
    throw new ModerationServerApiError(400, "invalid_id", "Invalid account ID");
  }
  return safe;
}

/**
 * Make a proxied request with timeout handling.
 */
async function request(
  endpoint: string,
  init: RequestInit,
  options: ModerationServerApiOptions = {}
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) throw new ModerationServerApiError(0, "no_fetch", "Fetch is unavailable");

  const timeoutMs = options.timeoutMs ?? 12_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort(options.signal?.reason);

  if (options.signal?.aborted) {
    controller.abort(options.signal.reason);
  } else {
    options.signal?.addEventListener("abort", onAbort, { once: true });
  }

  try {
    const response = await fetchImpl(endpoint, { ...init, signal: controller.signal });

    if (response.ok) return response;

    const body = await response.json().catch(() => ({}));
    const message = body?.message ?? body?.error ?? `Request failed with status ${response.status}`;
    throw new ModerationServerApiError(response.status, body?.error ?? "request_failed", message);
  } catch (error) {
    if (error instanceof ModerationServerApiError) throw error;
    // Network errors (offline, DNS failure, etc.)
    throw new ModerationServerApiError(0, "network_error", error instanceof Error ? error.message : "Network request failed");
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

// ---------------------------------------------------------------------------
// Mutes
// ---------------------------------------------------------------------------

/**
 * Fetch the user's server-side mute list.
 * Returns an array of muted account objects.
 */
export async function fetchServerMutes(options: ModerationServerApiOptions = {}): Promise<ServerAccount[]> {
  const response = await request(`${PROXY_BASE}/mutes`, { method: "GET" }, options);
  const data = await response.json();
  // Mastodon returns an array of Account objects
  if (!Array.isArray(data)) return [];
  return data.map((account: Record<string, unknown>) => ({
    id: String(account.id ?? ""),
    acct: String(account.acct ?? ""),
    username: account.username != null ? String(account.username) : undefined,
    display_name: account.display_name != null ? String(account.display_name) : undefined,
    url: account.url != null ? String(account.url) : undefined
  })).filter((a: ServerAccount) => a.id && a.acct);
}

/**
 * Mute an account on the server.
 */
export async function serverMuteAccount(
  accountId: string,
  params: { notifications?: boolean; duration?: number } = {},
  options: ModerationServerApiOptions = {}
): Promise<void> {
  const safeId = validateAccountId(accountId);
  const body: Record<string, unknown> = {};
  if (params.notifications != null) body.notifications = params.notifications;
  if (params.duration != null) body.duration = params.duration;

  await request(
    `${PROXY_BASE}/accounts/${encodeURIComponent(safeId)}/mute`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    },
    options
  );
}

/**
 * Unmute an account on the server.
 */
export async function serverUnmuteAccount(
  accountId: string,
  options: ModerationServerApiOptions = {}
): Promise<void> {
  const safeId = validateAccountId(accountId);
  await request(
    `${PROXY_BASE}/accounts/${encodeURIComponent(safeId)}/unmute`,
    { method: "POST" },
    options
  );
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/**
 * Fetch the user's server-side block list.
 * Returns an array of blocked account objects.
 */
export async function fetchServerBlocks(options: ModerationServerApiOptions = {}): Promise<ServerAccount[]> {
  const response = await request(`${PROXY_BASE}/blocks`, { method: "GET" }, options);
  const data = await response.json();
  if (!Array.isArray(data)) return [];
  return data.map((account: Record<string, unknown>) => ({
    id: String(account.id ?? ""),
    acct: String(account.acct ?? ""),
    username: account.username != null ? String(account.username) : undefined,
    display_name: account.display_name != null ? String(account.display_name) : undefined,
    url: account.url != null ? String(account.url) : undefined
  })).filter((a: ServerAccount) => a.id && a.acct);
}

/**
 * Block an account on the server.
 */
export async function serverBlockAccount(
  accountId: string,
  options: ModerationServerApiOptions = {}
): Promise<void> {
  const safeId = validateAccountId(accountId);
  await request(
    `${PROXY_BASE}/accounts/${encodeURIComponent(safeId)}/block`,
    { method: "POST" },
    options
  );
}

/**
 * Unblock an account on the server.
 */
export async function serverUnblockAccount(
  accountId: string,
  options: ModerationServerApiOptions = {}
): Promise<void> {
  const safeId = validateAccountId(accountId);
  await request(
    `${PROXY_BASE}/accounts/${encodeURIComponent(safeId)}/unblock`,
    { method: "POST" },
    options
  );
}

// ---------------------------------------------------------------------------
// Domain Blocks
// ---------------------------------------------------------------------------

/**
 * Fetch the user's server-side domain block list.
 * Mastodon returns an array of domain strings.
 */
export async function fetchServerDomainBlocks(options: ModerationServerApiOptions = {}): Promise<string[]> {
  const response = await request(`${PROXY_BASE}/domain_blocks`, { method: "GET" }, options);
  const data = await response.json();
  if (!Array.isArray(data)) return [];
  return data.filter((d: unknown) => typeof d === "string" && d.length > 0);
}

/**
 * Add a domain block on the server.
 */
export async function serverBlockDomain(
  domain: string,
  options: ModerationServerApiOptions = {}
): Promise<void> {
  const normalized = domain.trim().toLowerCase();
  if (!normalized) throw new ModerationServerApiError(400, "invalid_domain", "Domain cannot be empty");

  await request(
    `${PROXY_BASE}/domain_blocks`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: normalized })
    },
    options
  );
}

/**
 * Remove a domain block on the server.
 */
export async function serverUnblockDomain(
  domain: string,
  options: ModerationServerApiOptions = {}
): Promise<void> {
  const normalized = domain.trim().toLowerCase();
  if (!normalized) throw new ModerationServerApiError(400, "invalid_domain", "Domain cannot be empty");

  await request(
    `${PROXY_BASE}/domain_blocks`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: normalized })
    },
    options
  );
}
