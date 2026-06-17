/**
 * useActivityTab - Encapsulates all activity tab state.
 *
 * Owns: session awareness, timeline/notification fetching, status interactions
 * (favourite/bookmark), compose state, refresh/reconnect logic, and error mapping.
 *
 * App.tsx retains connectedAccount (used by other tabs) and the session query,
 * but the activity tab no longer pushes low-level fetch mechanics up to the root.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useMastodonSession,
  useMastodonHomeTimeline,
  useMastodonNotifications,
  useDisconnectMastodon,
  getMastodonActivityErrorState,
  mastodonActivityQueryKeys,
  type MastodonActivityErrorState
} from "../sync/use-mastodon-activity";
import {
  favouriteStatus as apiFavouriteStatus,
  unfavouriteStatus as apiUnfavouriteStatus,
  bookmarkStatus as apiBookmarkStatus,
  unbookmarkStatus as apiUnbookmarkStatus
} from "../sync/mastodon-activity-api";
import type { MastodonStatus, MastodonNotification } from "../sync/mastodon-client";

export type ConnectedAccount = {
  instanceOrigin: string;
  acct: string;
  displayName?: string;
  avatar?: string;
  profileUrl?: string;
  grantedScopes?: string[];
};

export type ActivityTabState = {
  /** Derived connected account (null when signed out). */
  connectedAccount: ConnectedAccount | null;
  /** Whether the session is still loading. */
  isLoadingSession: boolean;
  /** Timeline items (empty array when signed out or no posts). */
  timeline: MastodonStatus[];
  /** Notification items. */
  notifications: MastodonNotification[];
  /** True while activity data is being fetched for a connected account. */
  isLoadingActivity: boolean;
  /** User-facing error message, or null. */
  activityError: string | null;
  /** Structured error state for granular UI decisions. */
  activityErrorState: MastodonActivityErrorState | null;
  /** Timestamp of last successful timeline fetch, or null. */
  loadedAt: number | null;
  /** Optimistic interaction state per status. */
  statusInteractions: Map<string, { favourited: boolean; bookmarked: boolean }>;
  /** Whether the compose sheet should be visible. */
  composeOpen: boolean;
  /** Open the compose sheet. */
  openCompose: () => void;
  /** Close the compose sheet. */
  closeCompose: () => void;
  /** Handle a successful post from the compose sheet. */
  handlePosted: (posted: MastodonStatus) => void;
  /** Favourite/unfavourite a status. */
  handleFavourite: (statusId: string, currentFavourited: boolean) => void;
  /** Bookmark/unbookmark a status. */
  handleBookmark: (statusId: string, currentBookmarked: boolean) => void;
  /** Refresh activity data. */
  refresh: () => void;
  /** Whether a reconnect is required (auth error). */
  reconnectRequired: boolean;
  /** Disconnect the current account. */
  disconnect: () => void;
  /** Whether a disconnect is in progress. */
  isDisconnecting: boolean;
};

/** Returns true when a token grants the needed write scope (or scopes are unknown, treated optimistically). */
function hasWriteScope(grantedScopes: string[] | undefined, needed: string): boolean {
  if (!grantedScopes || grantedScopes.length === 0) return true;
  const base = needed.split(":")[0];
  return grantedScopes.some((s) => s === needed || s === base || s === "write" || s === "read write");
}

export { hasWriteScope };

export function useActivityTab(): ActivityTabState {
  const queryClient = useQueryClient();
  const sessionQuery = useMastodonSession();
  const disconnectMutation = useDisconnectMastodon();

  const connectedAccount = useMemo((): ConnectedAccount | null => {
    const s = sessionQuery.data;
    if (!s?.connected || !s.account?.acct || !s.instanceOrigin) return null;
    return {
      instanceOrigin: s.instanceOrigin,
      acct: s.account.acct,
      displayName: s.account.display_name || undefined,
      avatar: s.account.avatar || undefined,
      profileUrl: s.account.url || undefined,
      grantedScopes: s.scope ? s.scope.split(" ").filter(Boolean) : undefined
    };
  }, [sessionQuery.data]);

  const isConnected = connectedAccount !== null;

  const homeTimelineQuery = useMastodonHomeTimeline({
    enabled: isConnected,
    limit: 20
  });
  const notificationsQuery = useMastodonNotifications({
    enabled: isConnected,
    limit: 20
  });

  const timeline = homeTimelineQuery.data?.items ?? [];
  const notifications = notificationsQuery.data?.items ?? [];
  const isLoadingActivity = isConnected && (homeTimelineQuery.isFetching || notificationsQuery.isFetching);

  const activityErrorState = useMemo((): MastodonActivityErrorState | null => {
    return getMastodonActivityErrorState(homeTimelineQuery.error) ??
      getMastodonActivityErrorState(notificationsQuery.error) ??
      null;
  }, [homeTimelineQuery.error, notificationsQuery.error]);

  const activityError = activityErrorState?.message ?? null;
  const reconnectRequired = activityErrorState?.reconnectRequired ?? false;
  const loadedAt = homeTimelineQuery.dataUpdatedAt || null;

  // Status interactions (optimistic favourite/bookmark)
  const [statusInteractions, setStatusInteractions] = useState<Map<string, { favourited: boolean; bookmarked: boolean }>>(() => new Map());
  const [composeOpen, setComposeOpen] = useState(false);

  // Reset state when disconnected
  useEffect(() => {
    if (isConnected) return;
    setStatusInteractions(new Map());
    setComposeOpen(false);
  }, [isConnected]);

  // Handle auth errors: clear session on reconnect-required
  useEffect(() => {
    const sessionErr = getMastodonActivityErrorState(sessionQuery.error);
    const timelineErr = getMastodonActivityErrorState(homeTimelineQuery.error);
    const notifErr = getMastodonActivityErrorState(notificationsQuery.error);
    const needsReconnect = sessionErr?.reconnectRequired || timelineErr?.reconnectRequired || notifErr?.reconnectRequired;
    if (needsReconnect) {
      queryClient.setQueryData(mastodonActivityQueryKeys.session(), { connected: false });
    }
  }, [sessionQuery.error, homeTimelineQuery.error, notificationsQuery.error, queryClient]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: mastodonActivityQueryKeys.homeTimelineRoot() });
    void queryClient.invalidateQueries({ queryKey: mastodonActivityQueryKeys.notificationsRoot() });
  }, [queryClient]);

  const openCompose = useCallback(() => setComposeOpen(true), []);
  const closeCompose = useCallback(() => setComposeOpen(false), []);

  const handlePosted = useCallback((posted: MastodonStatus) => {
    setComposeOpen(false);
    queryClient.setQueryData(
      mastodonActivityQueryKeys.homeTimeline({ limit: 20 }),
      (prev: { items: MastodonStatus[]; links: Record<string, string> } | undefined) =>
        prev ? { ...prev, items: [posted, ...prev.items] } : prev
    );
  }, [queryClient]);

  const handleFavourite = useCallback((statusId: string, currentFavourited: boolean) => {
    setStatusInteractions((prev) => {
      const next = new Map(prev);
      const existing = next.get(statusId);
      next.set(statusId, { favourited: !currentFavourited, bookmarked: existing?.bookmarked ?? false });
      return next;
    });
    const apiCall = currentFavourited ? apiUnfavouriteStatus : apiFavouriteStatus;
    void apiCall(statusId)
      .then((updated) => {
        queryClient.setQueryData(
          mastodonActivityQueryKeys.homeTimeline({ limit: 20 }),
          (prev: { items: MastodonStatus[]; links: Record<string, string> } | undefined) =>
            prev ? { ...prev, items: prev.items.map((s: MastodonStatus) => s.id === updated.id ? updated : s) } : prev
        );
        setStatusInteractions((prev) => {
          const next = new Map(prev);
          next.delete(statusId);
          return next;
        });
      })
      .catch(() => {
        setStatusInteractions((prev) => {
          const next = new Map(prev);
          const existing = next.get(statusId);
          if (existing) next.set(statusId, { ...existing, favourited: currentFavourited });
          return next;
        });
      });
  }, [queryClient]);

  const handleBookmark = useCallback((statusId: string, currentBookmarked: boolean) => {
    setStatusInteractions((prev) => {
      const next = new Map(prev);
      const existing = next.get(statusId);
      next.set(statusId, { favourited: existing?.favourited ?? false, bookmarked: !currentBookmarked });
      return next;
    });
    const apiCall = currentBookmarked ? apiUnbookmarkStatus : apiBookmarkStatus;
    void apiCall(statusId)
      .then((updated) => {
        queryClient.setQueryData(
          mastodonActivityQueryKeys.homeTimeline({ limit: 20 }),
          (prev: { items: MastodonStatus[]; links: Record<string, string> } | undefined) =>
            prev ? { ...prev, items: prev.items.map((s: MastodonStatus) => s.id === updated.id ? updated : s) } : prev
        );
        setStatusInteractions((prev) => {
          const next = new Map(prev);
          next.delete(statusId);
          return next;
        });
      })
      .catch(() => {
        setStatusInteractions((prev) => {
          const next = new Map(prev);
          const existing = next.get(statusId);
          if (existing) next.set(statusId, { ...existing, bookmarked: currentBookmarked });
          return next;
        });
      });
  }, [queryClient]);

  const disconnect = useCallback(() => {
    void disconnectMutation.mutateAsync();
  }, [disconnectMutation]);

  return {
    connectedAccount,
    isLoadingSession: sessionQuery.isPending,
    timeline,
    notifications,
    isLoadingActivity,
    activityError,
    activityErrorState,
    loadedAt,
    statusInteractions,
    composeOpen,
    openCompose,
    closeCompose,
    handlePosted,
    handleFavourite,
    handleBookmark,
    refresh,
    reconnectRequired,
    disconnect,
    isDisconnecting: disconnectMutation.isPending
  };
}
