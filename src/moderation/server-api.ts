/**
 * Moderation Server API.
 *
 * Frontend API wrapper that calls the backend proxy endpoints for moderation
 * operations. The browser never calls Mastodon directly; all requests go
 * through /api/auth/mastodon/moderation/* which the backend proxy forwards
 * to the Mastodon instance using the stored session token.
 *
 * Architecture: Mastodon Server -> Backend Proxy -> This API -> React Query ->
 * Sync to Local Store -> Applied at Runtime.
 */

import { z } from "zod";
import {
  mastodonFilterSchema,
  mastodonRelationshipSchema,
  mastodonAccountSchema,
  type MastodonFilter,
  type MastodonRelationship,
  type MastodonAccount,
  type MastodonPaginationParams
} from "../sync/mastodon-client";

// ─── Endpoints ────────────────────────────────────────────────────────────────

export const MODERATION_FILTERS_ENDPOINT = "/api/auth/mastodon/moderation/filters";
export const MODERATION_MUTES_ENDPOINT = "/api/auth/mastodon/moderation/mutes";
export const MODERATION_BLOCKS_ENDPOINT = "/api/auth/mastodon/moderation/blocks";
export const MODERATION_RELATIONSHIPS_ENDPOINT = "/api/auth/mastodon/moderation/relationships";
export const MODERATION_MUTE_ENDPOINT = "/api/auth/mastodon/moderation/mute";
export const MODERATION_UNMUTE_ENDPOINT = "/api/auth/mastodon/moderation/unmute";
export const MODERATION_BLOCK_ENDPOINT = "/api/auth/mastodon/moderation/block";
export const MODERATION_UNBLOCK_ENDPOINT = "/api/auth/mastodon/moderation/unblock";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModerationApiOptions = {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type CreateFilterParams = {
  title: string;
  context: string[];
  filter_action?: "warn" | "hide";
  expires_in?: number;
  keywords_attributes?: Array<{ keyword: string; whole_word?: boolean }>;
};

export type MuteAccountParams = {
  account_id: string;
  notifications?: boolean;
  duration?: number;
};

export type BlockAccountParams = {
  account_id: string;
};

// ─── Error ────────────────────────────────────────────────────────────────────

export class ModerationApiError extends Error {
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

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

// ─── Read Operations ──────────────────────────────────────────────────────────

/**
 * Fetch all server-side content filters from the Mastodon instance.
 */
export async function getServerFilters(options: ModerationApiOptions = {}): Promise<MastodonFilter[]> {
  const response = await moderationRequest(MODERATION_FILTERS_ENDPOINT, { method: "GET" }, options);
  return z.array(mastodonFilterSchema).parse(await response.json());
}

/**
 * Fetch muted accounts from the Mastodon instance.
 */
export async function getServerMutes(
  params: MastodonPaginationParams = {},
  options: ModerationApiOptions = {}
): Promise<{ items: MastodonAccount[] }> {
  const endpoint = withPagination(MODERATION_MUTES_ENDPOINT, params);
  const response = await moderationRequest(endpoint, { method: "GET" }, options);
  const json = await response.json();
  const parsed = z.object({ items: z.array(mastodonAccountSchema), links: z.unknown().optional() }).parse(json);
  return { items: parsed.items };
}

/**
 * Fetch blocked accounts from the Mastodon instance.
 */
export async function getServerBlocks(
  params: MastodonPaginationParams = {},
  options: ModerationApiOptions = {}
): Promise<{ items: MastodonAccount[] }> {
  const endpoint = withPagination(MODERATION_BLOCKS_ENDPOINT, params);
  const response = await moderationRequest(endpoint, { method: "GET" }, options);
  const json = await response.json();
  const parsed = z.object({ items: z.array(mastodonAccountSchema), links: z.unknown().optional() }).parse(json);
  return { items: parsed.items };
}

/**
 * Fetch account relationships (following, blocking, muting status).
 */
export async function getRelationships(
  accountIds: string[],
  options: ModerationApiOptions = {}
): Promise<MastodonRelationship[]> {
  if (accountIds.length === 0) return [];

  const url = new URL(MODERATION_RELATIONSHIPS_ENDPOINT, "https://ryu.local");
  for (const id of accountIds) {
    url.searchParams.append("id[]", id);
  }
  const endpoint = `${url.pathname}${url.search}`;
  const response = await moderationRequest(endpoint, { method: "GET" }, options);
  return z.array(mastodonRelationshipSchema).parse(await response.json());
}

// ─── Write Operations ─────────────────────────────────────────────────────────

/**
 * Create a new server-side content filter.
 * Requires write:filters OAuth scope.
 */
export async function createServerFilter(
  params: CreateFilterParams,
  options: ModerationApiOptions = {}
): Promise<MastodonFilter> {
  const response = await moderationRequest(
    MODERATION_FILTERS_ENDPOINT,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    },
    options
  );
  return mastodonFilterSchema.parse(await response.json());
}

/**
 * Delete a server-side content filter.
 * Requires write:filters OAuth scope.
 */
export async function deleteServerFilter(
  filterId: string,
  options: ModerationApiOptions = {}
): Promise<void> {
  const safeId = filterId.trim();
  if (!safeId || !/^[\w-]{1,64}$/.test(safeId)) {
    throw new Error("Invalid filter ID");
  }
  await moderationRequest(
    `${MODERATION_FILTERS_ENDPOINT}/${encodeURIComponent(safeId)}`,
    { method: "DELETE" },
    options
  );
}

/**
 * Mute an account on the server.
 * Requires write:mutes OAuth scope.
 */
export async function muteAccount(
  params: MuteAccountParams,
  options: ModerationApiOptions = {}
): Promise<MastodonRelationship> {
  const response = await moderationRequest(
    MODERATION_MUTE_ENDPOINT,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    },
    options
  );
  return mastodonRelationshipSchema.parse(await response.json());
}

/**
 * Unmute an account on the server.
 * Requires write:mutes OAuth scope.
 */
export async function unmuteAccount(
  accountId: string,
  options: ModerationApiOptions = {}
): Promise<MastodonRelationship> {
  const response = await moderationRequest(
    MODERATION_UNMUTE_ENDPOINT,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId })
    },
    options
  );
  return mastodonRelationshipSchema.parse(await response.json());
}

/**
 * Block an account on the server.
 * Requires write:blocks OAuth scope.
 */
export async function blockAccount(
  params: BlockAccountParams,
  options: ModerationApiOptions = {}
): Promise<MastodonRelationship> {
  const response = await moderationRequest(
    MODERATION_BLOCK_ENDPOINT,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    },
    options
  );
  return mastodonRelationshipSchema.parse(await response.json());
}

/**
 * Unblock an account on the server.
 * Requires write:blocks OAuth scope.
 */
export async function unblockAccount(
  accountId: string,
  options: ModerationApiOptions = {}
): Promise<MastodonRelationship> {
  const response = await moderationRequest(
    MODERATION_UNBLOCK_ENDPOINT,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId })
    },
    options
  );
  return mastodonRelationshipSchema.parse(await response.json());
}

// ─── Internal ─────────────────────────────────────────────────────────────────

const errorResponseSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional()
}).passthrough();

async function moderationRequest(
  endpoint: string,
  init: RequestInit,
  options: ModerationApiOptions
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) throw new Error("Fetch is unavailable");

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
    const response = await fetchImpl(endpoint, {
      ...init,
      signal: controller.signal,
      credentials: "same-origin"
    });

    if (response.ok) return response;

    const parsed = errorResponseSchema.safeParse(await response.json().catch(() => ({})));
    const code = parsed.success && parsed.data.error ? parsed.data.error : "moderation_request_failed";
    const message = parsed.success && parsed.data.message
      ? parsed.data.message
      : `Moderation request failed with status ${response.status}`;
    throw new ModerationApiError(response.status, code, message);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

function withPagination(endpoint: string, params: MastodonPaginationParams): string {
  const url = new URL(endpoint, "https://ryu.local");
  if (params.limit != null) url.searchParams.set("limit", String(params.limit));
  if (params.maxId) url.searchParams.set("max_id", params.maxId);
  if (params.sinceId) url.searchParams.set("since_id", params.sinceId);
  if (params.minId) url.searchParams.set("min_id", params.minId);
  return `${url.pathname}${url.search}`;
}
