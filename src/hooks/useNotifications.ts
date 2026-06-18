/**
 * useNotifications - Unified hook for notification state management.
 *
 * Combines:
 * - Remote fetch via useMastodonNotifications (react-query)
 * - Local cache for offline access (localStorage)
 * - Grouping logic (multiple favs/boosts on same status = one group)
 * - Read/unread state (localStorage persisted)
 * - Filter controls (all, mentions, favourites, follows, boosts)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMastodonNotifications } from "../sync/use-mastodon-activity";
import type { MastodonNotification } from "../sync/mastodon-client";
import {
  loadReadState,
  saveReadState,
  markAsRead as applyMarkAsRead,
  markMultipleAsRead as applyMarkMultipleAsRead,
  markAllAsRead as applyMarkAllAsRead,
  isGroupRead
} from "../notifications/read-state";
import {
  loadCachedNotifications,
  saveCachedNotifications
} from "../notifications/notification-cache";
import { groupNotifications } from "../notifications/notification-grouper";
import type {
  GroupedNotification,
  NotificationFilter,
  RawNotification,
  ReadState
} from "../notifications/types";

export type UseNotificationsOptions = {
  enabled?: boolean;
  limit?: number;
};

export type UseNotificationsResult = {
  /** Grouped notifications after filtering. */
  groups: GroupedNotification[];
  /** Total unread count (ungrouped). */
  unreadCount: number;
  /** Whether remote data is loading. */
  isLoading: boolean;
  /** Current active filter. */
  filter: NotificationFilter;
  /** Change the active filter. */
  setFilter: (filter: NotificationFilter) => void;
  /** Mark a single group as read. */
  markGroupRead: (notificationIds: string[]) => void;
  /** Mark all notifications as read. */
  markAllRead: () => void;
  /** Whether a group is read. */
  isRead: (group: GroupedNotification) => boolean;
};

function toRawNotification(n: MastodonNotification): RawNotification {
  return {
    id: n.id,
    type: n.type,
    created_at: n.created_at,
    account: {
      id: n.account.id,
      acct: n.account.acct,
      display_name: n.account.display_name,
      avatar: n.account.avatar ?? undefined,
      url: n.account.url ?? undefined
    },
    status: n.status
      ? {
          id: n.status.id,
          content: n.status.content,
          url: n.status.url,
          created_at: n.status.created_at
        }
      : null
  };
}

export function useNotifications(options: UseNotificationsOptions = {}): UseNotificationsResult {
  const { enabled = true, limit = 40 } = options;

  // Remote query
  const query = useMastodonNotifications({ enabled, limit });
  const remoteNotifications = query.data?.items ?? [];

  // Local state
  const [readState, setReadState] = useState<ReadState>(() => loadReadState());
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [cachedNotifications, setCachedNotifications] = useState<RawNotification[]>(() =>
    loadCachedNotifications()
  );

  // Track if we already synced remote to cache this mount
  const hasSyncedRef = useRef(false);

  // Sync remote notifications to local cache when they arrive
  useEffect(() => {
    if (remoteNotifications.length === 0) return;

    const raw = remoteNotifications.map(toRawNotification);
    const isDifferent = cachedNotifications.length !== raw.length ||
      raw.some((n, i) => cachedNotifications[i]?.id !== n.id);

    if (isDifferent) {
      saveCachedNotifications(raw);
      setCachedNotifications(raw);
    }
    hasSyncedRef.current = true;
  }, [remoteNotifications, cachedNotifications]);

  // Build the effective notification list (remote takes priority, fallback to cache)
  const effectiveNotifications: RawNotification[] = useMemo(() => {
    if (remoteNotifications.length > 0) {
      return remoteNotifications.map(toRawNotification);
    }
    return cachedNotifications;
  }, [remoteNotifications, cachedNotifications]);

  // Apply filter
  const filteredNotifications = useMemo(() => {
    if (filter === "all") return effectiveNotifications;
    return effectiveNotifications.filter((n) => n.type === filter);
  }, [effectiveNotifications, filter]);

  // Group notifications
  const groups = useMemo(() => {
    return groupNotifications(filteredNotifications);
  }, [filteredNotifications]);

  // Compute unread count from ungrouped, unfiltered notifications
  const unreadCount = useMemo(() => {
    let count = 0;
    for (const n of effectiveNotifications) {
      const isRead = readState.readIds.has(n.id) ||
        (readState.markAllReadAt != null && n.created_at <= readState.markAllReadAt);
      if (!isRead) count += 1;
    }
    return count;
  }, [effectiveNotifications, readState]);

  // Persist read state whenever it changes
  const readStateRef = useRef(readState);
  useEffect(() => {
    if (readStateRef.current !== readState) {
      readStateRef.current = readState;
      saveReadState(readState);
    }
  }, [readState]);

  const markGroupRead = useCallback((notificationIds: string[]) => {
    setReadState((prev) => applyMarkMultipleAsRead(prev, notificationIds));
  }, []);

  const markAllRead = useCallback(() => {
    setReadState((prev) => applyMarkAllAsRead(prev));
  }, []);

  const isRead = useCallback(
    (group: GroupedNotification) => {
      return isGroupRead(readState, group.notificationIds, group.latestAt, (id) => {
        const n = effectiveNotifications.find((x) => x.id === id);
        return n ? n.created_at : group.latestAt;
      });
    },
    [readState, effectiveNotifications]
  );

  return {
    groups,
    unreadCount,
    isLoading: query.isFetching,
    filter,
    setFilter,
    markGroupRead,
    markAllRead,
    isRead
  };
}
