import { z } from "zod";
import { parseBookTokTrendingPayload, type BookTokTrend } from "./booktok-trending";
import {
  type MastodonNotification,
  type MastodonPage,
  type MastodonPaginationParams,
  type MastodonStatus
} from "./mastodon-client";
import {
  MastodonSessionApiError,
  parseMastodonNotificationPageResponse,
  parseMastodonStatusPageResponse
} from "./mastodon-session-api";

export const MASTODON_SESSION_ENDPOINT = "/api/auth/mastodon/session";
export const MASTODON_REVOKE_ENDPOINT = "/api/auth/mastodon/revoke";
export const MASTODON_HOME_TIMELINE_ENDPOINT = "/api/auth/mastodon/timelines/home";
export const MASTODON_NOTIFICATIONS_ENDPOINT = "/api/auth/mastodon/notifications";
export const MASTODON_ACCOUNT_STATUSES_ENDPOINT = "/api/auth/mastodon/account/statuses";
export const BOOKTOK_TRENDING_ENDPOINT = "/api/trends/booktok";

export type MastodonSessionState = {
  connected: boolean;
  instanceOrigin?: string;
  account?: {
    id?: string;
    username?: string;
    acct: string;
    url?: string;
  } | null;
  scope?: string | null;
};

export type MastodonActivityApiOptions = {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  attempts?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export class MastodonActivityApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterMs?: number
  ) {
    super(message);
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

const sessionSchema = z.object({
  connected: z.boolean().default(false),
  instanceOrigin: z.string().optional(),
  account: z.object({
    id: z.string().optional(),
    username: z.string().optional(),
    acct: z.string().min(1),
    url: z.string().optional()
  }).nullable().optional(),
  scope: z.string().nullable().optional()
});

const errorResponseSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional()
}).passthrough();

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function getMastodonSession(options: MastodonActivityApiOptions = {}): Promise<MastodonSessionState> {
  const response = await requestProxy(MASTODON_SESSION_ENDPOINT, { method: "GET" }, { ...options, attempts: options.attempts ?? 2 });
  const parsed = sessionSchema.parse(await response.json());
  return parsed.connected ? parsed : { connected: false };
}

export async function getHomeTimeline(
  params: MastodonPaginationParams = {},
  options: MastodonActivityApiOptions = {}
): Promise<MastodonPage<MastodonStatus>> {
  const response = await requestProxy(withPagination(MASTODON_HOME_TIMELINE_ENDPOINT, params), { method: "GET" }, options);
  return parseMastodonStatusPageResponse(response);
}

export async function getNotifications(
  params: MastodonPaginationParams = {},
  options: MastodonActivityApiOptions = {}
): Promise<MastodonPage<MastodonNotification>> {
  const response = await requestProxy(withPagination(MASTODON_NOTIFICATIONS_ENDPOINT, params), { method: "GET" }, options);
  return parseMastodonNotificationPageResponse(response);
}

export async function getAccountStatuses(
  params: MastodonPaginationParams = {},
  options: MastodonActivityApiOptions = {}
): Promise<MastodonPage<MastodonStatus>> {
  const response = await requestProxy(withPagination(MASTODON_ACCOUNT_STATUSES_ENDPOINT, params), { method: "GET" }, options);
  return parseMastodonStatusPageResponse(response);
}

export async function getBookTokTrends(options: MastodonActivityApiOptions = {}): Promise<BookTokTrend[]> {
  const response = await requestProxy(BOOKTOK_TRENDING_ENDPOINT, { method: "GET" }, { ...options, attempts: options.attempts ?? 2 });
  return parseBookTokTrendingPayload(await response.json());
}

export async function disconnectMastodon(options: MastodonActivityApiOptions = {}): Promise<void> {
  await requestProxy(MASTODON_REVOKE_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, {
    ...options,
    attempts: options.attempts ?? 1
  });
}

async function requestProxy(
  endpoint: string,
  init: RequestInit,
  options: MastodonActivityApiOptions
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) throw new Error("Fetch is unavailable");

  const attempts = Math.max(1, options.attempts ?? 3);
  const timeoutMs = options.timeoutMs ?? 12_000;
  const sleep = options.sleep ?? defaultSleep;
  const path = normalizeProxyPath(endpoint);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort(options.signal?.reason);

    if (options.signal?.aborted) {
      controller.abort(options.signal.reason);
    } else {
      options.signal?.addEventListener("abort", onAbort, { once: true });
    }

    try {
      const response = await fetchImpl(path, { ...init, signal: controller.signal });
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);

      if (response.ok) return response;

      const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
      const apiError = await toActivityApiError(response, retryAfterMs);
      const shouldRetry = RETRYABLE_STATUS_CODES.has(response.status) && response.status !== 401 && response.status !== 403 && attempt < attempts;
      if (shouldRetry) {
        await sleep(retryAfterMs ?? backoffMs(attempt));
        continue;
      }

      throw apiError;
    } catch (error) {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);

      if (options.signal?.aborted) throw error;
      if (error instanceof MastodonActivityApiError || error instanceof MastodonSessionApiError) throw error;

      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts) {
        await sleep(backoffMs(attempt));
        continue;
      }
    }
  }

  throw lastError ?? new Error("Request failed");
}

function withPagination(endpoint: string, params: MastodonPaginationParams): string {
  const url = new URL(endpoint, "https://ryu.local");
  appendOptional(url, "limit", params.limit);
  appendOptional(url, "max_id", params.maxId);
  appendOptional(url, "since_id", params.sinceId);
  appendOptional(url, "min_id", params.minId);
  return `${url.pathname}${url.search}`;
}

function appendOptional(url: URL, key: string, value: string | number | undefined): void {
  if (value == null) return;
  url.searchParams.set(key, String(value));
}

function normalizeProxyPath(endpoint: string): string {
  if (!endpoint.startsWith("/")) {
    throw new Error("Mastodon activity client only accepts same-origin proxy paths");
  }

  const url = new URL(endpoint, "https://ryu.local");
  const allowed = new Set([
    MASTODON_SESSION_ENDPOINT,
    MASTODON_REVOKE_ENDPOINT,
    MASTODON_HOME_TIMELINE_ENDPOINT,
    MASTODON_NOTIFICATIONS_ENDPOINT,
    MASTODON_ACCOUNT_STATUSES_ENDPOINT,
    BOOKTOK_TRENDING_ENDPOINT
  ]);

  if (!allowed.has(url.pathname)) {
    throw new Error("Mastodon activity proxy path is not allowed");
  }

  return `${url.pathname}${url.search}`;
}

async function toActivityApiError(response: Response, retryAfterMs?: number): Promise<MastodonActivityApiError> {
  const parsed = errorResponseSchema.safeParse(await response.json().catch(() => ({})));
  const code = parsed.success && parsed.data.error ? parsed.data.error : "activity_request_failed";
  const fallback = response.status === 401 || response.status === 403
    ? "Session expired. Reconnect your account."
    : response.status === 429
      ? "Activity is temporarily rate limited. Try again shortly."
      : response.status >= 500
        ? "Activity is temporarily unavailable."
        : "Activity could not be loaded.";
  const message = parsed.success && parsed.data.message ? parsed.data.message : fallback;
  return new MastodonActivityApiError(response.status, code, message, retryAfterMs);
}

function backoffMs(attempt: number): number {
  const jitter = Math.floor(Math.random() * 120);
  return Math.min(2_000, 200 * 2 ** Math.max(0, attempt - 1) + jitter);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return undefined;

  return Math.max(0, dateMs - Date.now());
}
