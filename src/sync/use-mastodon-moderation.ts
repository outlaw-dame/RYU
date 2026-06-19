/**
 * Mastodon moderation sync hook.
 *
 * Provides mutations for block/mute/filter operations that proxy through
 * the auth middleware and invalidate relevant query caches on success.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from "@tanstack/react-query";

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const mastodonModerationQueryKeys = {
  all: ["mastodon-moderation"] as const,
  filters: () => [...mastodonModerationQueryKeys.all, "filters"] as const,
  mutes: () => [...mastodonModerationQueryKeys.all, "mutes"] as const,
  blocks: () => [...mastodonModerationQueryKeys.all, "blocks"] as const,
  relationships: () => [...mastodonModerationQueryKeys.all, "relationships"] as const,
  relationshipAccount: (accountId: string) => [
    ...mastodonModerationQueryKeys.relationships(),
    accountId
  ] as const
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModerationMuteParams = {
  accountId: string;
  notifications?: boolean;
  duration?: number;
};

export type ModerationBlockParams = {
  accountId: string;
};

export type ModerationRelationship = {
  id: string;
  following: boolean;
  followed_by: boolean;
  blocking: boolean;
  blocked_by: boolean;
  muting: boolean;
  muting_notifications: boolean;
  requested: boolean;
  domain_blocking: boolean;
  endorsed: boolean;
};

// ─── API Calls ────────────────────────────────────────────────────────────────

async function postMuteAccount(params: ModerationMuteParams): Promise<ModerationRelationship> {
  const response = await fetch("/api/auth/mastodon/moderation/mute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params)
  });
  if (!response.ok) throw new Error(`Mute failed: ${response.status}`);
  return response.json();
}

async function postUnmuteAccount(accountId: string): Promise<ModerationRelationship> {
  const response = await fetch("/api/auth/mastodon/moderation/unmute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId })
  });
  if (!response.ok) throw new Error(`Unmute failed: ${response.status}`);
  return response.json();
}

async function postBlockAccount(params: ModerationBlockParams): Promise<ModerationRelationship> {
  const response = await fetch("/api/auth/mastodon/moderation/block", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params)
  });
  if (!response.ok) throw new Error(`Block failed: ${response.status}`);
  return response.json();
}

async function postUnblockAccount(accountId: string): Promise<ModerationRelationship> {
  const response = await fetch("/api/auth/mastodon/moderation/unblock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId })
  });
  if (!response.ok) throw new Error(`Unblock failed: ${response.status}`);
  return response.json();
}

async function fetchRelationships(accountIds: string[]): Promise<ModerationRelationship[]> {
  const params = new URLSearchParams();
  for (const id of accountIds) {
    params.append("id[]", id);
  }
  const response = await fetch(`/api/auth/mastodon/moderation/relationships?${params.toString()}`);
  if (!response.ok) throw new Error(`Relationships fetch failed: ${response.status}`);
  return response.json();
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Mutation to mute an account. Invalidates the entire relationships prefix
 * so all relationship queries refresh.
 */
export function useMuteAccount(): UseMutationResult<ModerationRelationship, Error, ModerationMuteParams> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postMuteAccount,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mastodonModerationQueryKeys.relationships() });
    }
  });
}

/**
 * Mutation to unmute an account. Invalidates the entire relationships prefix
 * so all relationship queries refresh.
 */
export function useUnmuteAccount(): UseMutationResult<ModerationRelationship, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postUnmuteAccount,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mastodonModerationQueryKeys.relationships() });
    }
  });
}

/**
 * Mutation to block an account. Invalidates the entire relationships prefix
 * so all relationship queries refresh.
 */
export function useBlockAccount(): UseMutationResult<ModerationRelationship, Error, ModerationBlockParams> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postBlockAccount,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mastodonModerationQueryKeys.relationships() });
    }
  });
}

/**
 * Mutation to unblock an account. Invalidates the entire relationships prefix
 * so all relationship queries refresh.
 */
export function useUnblockAccount(): UseMutationResult<ModerationRelationship, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postUnblockAccount,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mastodonModerationQueryKeys.relationships() });
    }
  });
}

/**
 * Query hook to fetch relationships for a set of account IDs.
 */
export function useMastodonRelationships(
  accountIds: string[],
  options: { enabled?: boolean } = {}
): UseQueryResult<ModerationRelationship[]> {
  return useQuery({
    queryKey: [...mastodonModerationQueryKeys.relationships(), ...accountIds.sort()],
    queryFn: () => fetchRelationships(accountIds),
    enabled: (options.enabled ?? true) && accountIds.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000
  });
}
