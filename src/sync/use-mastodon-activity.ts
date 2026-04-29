import {
  onlineManager,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from "@tanstack/react-query";
import type { BookTokTrend } from "./booktok-trending";
import type { MastodonNotification, MastodonPage, MastodonPaginationParams, MastodonStatus } from "./mastodon-client";
import {
  disconnectMastodon,
  getAccountStatuses,
  getBookTokTrends,
  getHomeTimeline,
  getMastodonSession,
  getNotifications,
  MastodonActivityApiError,
  type MastodonSessionState
} from "./mastodon-activity-api";

const SESSION_STALE_MS = 60_000;
const ACTIVITY_STALE_MS = 30_000;
const ACCOUNT_ACTIVITY_STALE_MS = 45_000;
const TRENDS_STALE_MS = 5 * 60_000;
const QUERY_GC_MS = 60 * 60_000;
const DEFAULT_ACTIVITY_LIMIT = 20;

type ActivityHookOptions = {
  enabled?: boolean;
  limit?: number;
};

export type MastodonActivityErrorKind = "offline" | "rate-limited" | "reconnect" | "refresh-failed";

export type MastodonActivityErrorState = {
  kind: MastodonActivityErrorKind;
  message: string;
  reconnectRequired: boolean;
  retryAfterMs?: number;
};

export const mastodonActivityQueryKeys = {
  all: ["mastodon-activity"] as const,
  session: () => [...mastodonActivityQueryKeys.all, "session"] as const,
  homeTimelineRoot: () => [...mastodonActivityQueryKeys.all, "home-timeline"] as const,
  homeTimeline: (params: MastodonPaginationParams = {}) => [
    ...mastodonActivityQueryKeys.homeTimelineRoot(),
    normalizePaginationParams(params)
  ] as const,
  notificationsRoot: () => [...mastodonActivityQueryKeys.all, "notifications"] as const,
  notifications: (params: MastodonPaginationParams = {}) => [
    ...mastodonActivityQueryKeys.notificationsRoot(),
    normalizePaginationParams(params)
  ] as const,
  accountStatusesRoot: () => [...mastodonActivityQueryKeys.all, "account-statuses"] as const,
  accountStatuses: (params: MastodonPaginationParams = {}) => [
    ...mastodonActivityQueryKeys.accountStatusesRoot(),
    normalizePaginationParams(params)
  ] as const,
  bookTokTrends: () => [...mastodonActivityQueryKeys.all, "booktok-trends"] as const
};

export function useMastodonSession(): UseQueryResult<MastodonSessionState, Error> {
  return useQuery({
    queryKey: mastodonActivityQueryKeys.session(),
    queryFn: ({ signal }) => getMastodonSession({ signal }),
    staleTime: SESSION_STALE_MS,
    gcTime: QUERY_GC_MS,
    retry: shouldRetryActivityQuery,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false
  });
}

export function useMastodonHomeTimeline(
  options: ActivityHookOptions = {}
): UseQueryResult<MastodonPage<MastodonStatus>, Error> {
  const params = withDefaultLimit(options.limit);

  return useQuery({
    queryKey: mastodonActivityQueryKeys.homeTimeline(params),
    queryFn: ({ signal }) => getHomeTimeline(params, { signal }),
    enabled: options.enabled ?? true,
    staleTime: ACTIVITY_STALE_MS,
    gcTime: QUERY_GC_MS,
    retry: shouldRetryActivityQuery,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false
  });
}

export function useMastodonNotifications(
  options: ActivityHookOptions = {}
): UseQueryResult<MastodonPage<MastodonNotification>, Error> {
  const params = withDefaultLimit(options.limit);

  return useQuery({
    queryKey: mastodonActivityQueryKeys.notifications(params),
    queryFn: ({ signal }) => getNotifications(params, { signal }),
    enabled: options.enabled ?? true,
    staleTime: ACTIVITY_STALE_MS,
    gcTime: QUERY_GC_MS,
    retry: shouldRetryActivityQuery,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false
  });
}

export function useMastodonAccountStatuses(
  options: ActivityHookOptions = {}
): UseQueryResult<MastodonPage<MastodonStatus>, Error> {
  const params = withDefaultLimit(options.limit);

  return useQuery({
    queryKey: mastodonActivityQueryKeys.accountStatuses(params),
    queryFn: ({ signal }) => getAccountStatuses(params, { signal }),
    enabled: options.enabled ?? true,
    staleTime: ACCOUNT_ACTIVITY_STALE_MS,
    gcTime: QUERY_GC_MS,
    retry: shouldRetryActivityQuery,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false
  });
}

export function useBookTokTrends(options: { enabled?: boolean } = {}): UseQueryResult<BookTokTrend[], Error> {
  return useQuery({
    queryKey: mastodonActivityQueryKeys.bookTokTrends(),
    queryFn: ({ signal }) => getBookTokTrends({ signal }),
    enabled: options.enabled ?? true,
    staleTime: TRENDS_STALE_MS,
    gcTime: QUERY_GC_MS,
    retry: shouldRetryActivityQuery,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false
  });
}

export function useDisconnectMastodon(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => disconnectMastodon(),
    retry: false,
    onSuccess: async () => {
      queryClient.setQueryData<MastodonSessionState>(mastodonActivityQueryKeys.session(), { connected: false });
      queryClient.removeQueries({ queryKey: mastodonActivityQueryKeys.homeTimelineRoot() });
      queryClient.removeQueries({ queryKey: mastodonActivityQueryKeys.notificationsRoot() });
      queryClient.removeQueries({ queryKey: mastodonActivityQueryKeys.accountStatusesRoot() });
      await queryClient.invalidateQueries({ queryKey: mastodonActivityQueryKeys.session() });
    }
  });
}

export function getMastodonActivityErrorState(error: unknown): MastodonActivityErrorState | null {
  if (!error) return null;

  if (isBrowserOffline()) {
    return {
      kind: "offline",
      message: "You’re offline. We’ll refresh when you’re back.",
      reconnectRequired: false
    };
  }

  if (error instanceof MastodonActivityApiError) {
    if (error.isAuthError) {
      return {
        kind: "reconnect",
        message: "Session expired. Reconnect.",
        reconnectRequired: true
      };
    }

    if (error.isRateLimited) {
      return {
        kind: "rate-limited",
        message: "Activity is temporarily rate limited. Try again shortly.",
        reconnectRequired: false,
        retryAfterMs: error.retryAfterMs
      };
    }
  }

  return {
    kind: "refresh-failed",
    message: "Couldn’t refresh activity. Try again.",
    reconnectRequired: false
  };
}

function shouldRetryActivityQuery(failureCount: number, error: Error): boolean {
  if (error instanceof MastodonActivityApiError) {
    if (error.isAuthError || error.isRateLimited) return false;
    if (error.status >= 400 && error.status < 500) return false;
  }

  return failureCount < 1;
}

function withDefaultLimit(limit: number | undefined): MastodonPaginationParams {
  return normalizePaginationParams({ limit: limit ?? DEFAULT_ACTIVITY_LIMIT });
}

function normalizePaginationParams(params: MastodonPaginationParams): MastodonPaginationParams {
  const normalized: MastodonPaginationParams = {};

  if (params.limit != null) normalized.limit = params.limit;
  if (params.maxId) normalized.maxId = params.maxId;
  if (params.sinceId) normalized.sinceId = params.sinceId;
  if (params.minId) normalized.minId = params.minId;

  return normalized;
}

function isBrowserOffline(): boolean {
  if (onlineManager.isOnline() === false) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return false;
}
