/**
 * React Query hooks for Mastodon moderation state.
 *
 * Follows the same pattern as mastodonActivityQueryKeys in
 * use-mastodon-activity.ts. Fetches server-side moderation state (filters,
 * mutes, blocks) through the backend proxy and provides mutation hooks
 * for write operations.
 *
 * Architecture:
 * Mastodon server state -> imported via proxy -> merged into RYU local
 * policy store -> applied at runtime. The local store remains canonical
 * for offline; server state is merged in on sync.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from "@tanstack/react-query";
import type { MastodonFilter, MastodonRelationship, MastodonAccount, MastodonPaginationParams } from "./mastodon-client";
import {
  blockAccount,
  createServerFilter,
  deleteServerFilter,
  getRelationships,
  getServerBlocks,
  getServerFilters,
  getServerMutes,
  ModerationApiError,
  muteAccount,
  unblockAccount,
  unmuteAccount,
  type BlockAccountParams,
  type CreateFilterParams,
  type ModerationApiOptions,
  type MuteAccountParams
} from "../moderation/server-api";

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const mastodonModerationQueryKeys = {
  all: ["mastodon-moderation"] as const,
  filters: () => [...mastodonModerationQueryKeys.all, "filters"] as const,
  mutes: (params: MastodonPaginationParams = {}) => [
    ...mastodonModerationQueryKeys.all,
    "mutes",
    normalizePaginationParams(params)
  ] as const,
  blocks: (params: MastodonPaginationParams = {}) => [
    ...mastodonModerationQueryKeys.all,
    "blocks",
    normalizePaginationParams(params)
  ] as const,
  relationships: (accountIds: string[]) => [
    ...mastodonModerationQueryKeys.all,
    "relationships",
    [...accountIds].sort()
  ] as const
};

// ─── Stale Times ──────────────────────────────────────────────────────────────

const MODERATION_STALE_MS = 5 * 60_000; // 5 minutes
const RELATIONSHIP_STALE_MS = 2 * 60_000; // 2 minutes
const QUERY_GC_MS = 60 * 60_000; // 1 hour

// ─── Error Helpers ────────────────────────────────────────────────────────────

export type ModerationErrorKind = "offline" | "auth" | "rate-limited" | "failed";

export type ModerationErrorState = {
  kind: ModerationErrorKind;
  message: string;
  reconnectRequired: boolean;
};

export function getModerationErrorState(error: unknown): ModerationErrorState | null {
  if (!error) return null;

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      kind: "offline",
      message: "You are offline. Moderation data will sync when you reconnect.",
      reconnectRequired: false
    };
  }

  if (error instanceof ModerationApiError) {
    if (error.isAuthError) {
      return {
        kind: "auth",
        message: "Session expired. Reconnect to sync moderation state.",
        reconnectRequired: true
      };
    }
    if (error.isRateLimited) {
      return {
        kind: "rate-limited",
        message: "Rate limited. Moderation data will refresh shortly.",
        reconnectRequired: false
      };
    }
  }

  return {
    kind: "failed",
    message: "Could not load moderation data. Try again.",
    reconnectRequired: false
  };
}

// ─── Query Hooks ──────────────────────────────────────────────────────────────

type ModerationHookOptions = {
  enabled?: boolean;
};

/**
 * Fetch all server-side content filters.
 * These are merged into the local content filter store for offline use.
 */
export function useMastodonFilters(
  options: ModerationHookOptions = {}
): UseQueryResult<MastodonFilter[], Error> {
  return useQuery({
    queryKey: mastodonModerationQueryKeys.filters(),
    queryFn: ({ signal }) => getServerFilters({ signal }),
    enabled: options.enabled ?? true,
    staleTime: MODERATION_STALE_MS,
    gcTime: QUERY_GC_MS,
    retry: shouldRetryModerationQuery,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false
  });
}

/**
 * Fetch muted accounts from the server.
 * Merged into the local mute store for offline enforcement.
 */
export function useMastodonMutes(
  params: MastodonPaginationParams = {},
  options: ModerationHookOptions = {}
): UseQueryResult<{ items: MastodonAccount[] }, Error> {
  return useQuery({
    queryKey: mastodonModerationQueryKeys.mutes(params),
    queryFn: ({ signal }) => getServerMutes(params, { signal }),
    enabled: options.enabled ?? true,
    staleTime: MODERATION_STALE_MS,
    gcTime: QUERY_GC_MS,
    retry: shouldRetryModerationQuery,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false
  });
}

/**
 * Fetch blocked accounts from the server.
 * Merged into the local block store for offline enforcement.
 */
export function useMastodonBlocks(
  params: MastodonPaginationParams = {},
  options: ModerationHookOptions = {}
): UseQueryResult<{ items: MastodonAccount[] }, Error> {
  return useQuery({
    queryKey: mastodonModerationQueryKeys.blocks(params),
    queryFn: ({ signal }) => getServerBlocks(params, { signal }),
    enabled: options.enabled ?? true,
    staleTime: MODERATION_STALE_MS,
    gcTime: QUERY_GC_MS,
    retry: shouldRetryModerationQuery,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false
  });
}

/**
 * Fetch relationships for a set of account IDs.
 */
export function useMastodonRelationships(
  accountIds: string[],
  options: ModerationHookOptions = {}
): UseQueryResult<MastodonRelationship[], Error> {
  return useQuery({
    queryKey: mastodonModerationQueryKeys.relationships(accountIds),
    queryFn: ({ signal }) => getRelationships(accountIds, { signal }),
    enabled: (options.enabled ?? true) && accountIds.length > 0,
    staleTime: RELATIONSHIP_STALE_MS,
    gcTime: QUERY_GC_MS,
    retry: shouldRetryModerationQuery,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false
  });
}

// ─── Mutation Hooks ───────────────────────────────────────────────────────────

/**
 * Create a server-side content filter.
 * Invalidates the filters query on success.
 */
export function useCreateFilter(): UseMutationResult<MastodonFilter, Error, CreateFilterParams> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CreateFilterParams) => createServerFilter(params),
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mastodonModerationQueryKeys.filters() });
    }
  });
}

/**
 * Delete a server-side content filter.
 * Invalidates the filters query on success.
 */
export function useDeleteFilter(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (filterId: string) => deleteServerFilter(filterId),
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mastodonModerationQueryKeys.filters() });
    }
  });
}

/**
 * Mute an account on the server.
 * Invalidates mutes and relationships on success.
 */
export function useMuteAccount(): UseMutationResult<MastodonRelationship, Error, MuteAccountParams> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: MuteAccountParams) => muteAccount(params),
    retry: false,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: mastodonModerationQueryKeys.mutes() });
      void queryClient.invalidateQueries({
        queryKey: mastodonModerationQueryKeys.relationships([variables.account_id])
      });
    }
  });
}

/**
 * Unmute an account on the server.
 * Invalidates mutes and relationships on success.
 */
export function useUnmuteAccount(): UseMutationResult<MastodonRelationship, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: string) => unmuteAccount(accountId),
    retry: false,
    onSuccess: (_data, accountId) => {
      void queryClient.invalidateQueries({ queryKey: mastodonModerationQueryKeys.mutes() });
      void queryClient.invalidateQueries({
        queryKey: mastodonModerationQueryKeys.relationships([accountId])
      });
    }
  });
}

/**
 * Block an account on the server.
 * Invalidates blocks and relationships on success.
 */
export function useBlockAccount(): UseMutationResult<MastodonRelationship, Error, BlockAccountParams> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: BlockAccountParams) => blockAccount(params),
    retry: false,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: mastodonModerationQueryKeys.blocks() });
      void queryClient.invalidateQueries({
        queryKey: mastodonModerationQueryKeys.relationships([variables.account_id])
      });
    }
  });
}

/**
 * Unblock an account on the server.
 * Invalidates blocks and relationships on success.
 */
export function useUnblockAccount(): UseMutationResult<MastodonRelationship, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: string) => unblockAccount(accountId),
    retry: false,
    onSuccess: (_data, accountId) => {
      void queryClient.invalidateQueries({ queryKey: mastodonModerationQueryKeys.blocks() });
      void queryClient.invalidateQueries({
        queryKey: mastodonModerationQueryKeys.relationships([accountId])
      });
    }
  });
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function shouldRetryModerationQuery(failureCount: number, error: Error): boolean {
  if (error instanceof ModerationApiError) {
    if (error.isAuthError || error.isRateLimited) return false;
    if (error.status >= 400 && error.status < 500) return false;
  }
  return failureCount < 1;
}

function normalizePaginationParams(params: MastodonPaginationParams): MastodonPaginationParams {
  const normalized: MastodonPaginationParams = {};
  if (params.limit != null) normalized.limit = params.limit;
  if (params.maxId) normalized.maxId = params.maxId;
  if (params.sinceId) normalized.sinceId = params.sinceId;
  if (params.minId) normalized.minId = params.minId;
  return normalized;
}
