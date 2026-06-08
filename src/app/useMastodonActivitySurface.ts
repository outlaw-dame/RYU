import { useCallback, useMemo } from "react";
import { CURATED_BOOKTOK_TRENDS } from "../sync/booktok-trending";
import {
  getMastodonActivityErrorState,
  useBookTokTrends,
  useMastodonAccountStatuses,
  useMastodonHomeTimeline,
  useMastodonNotifications,
  useMastodonSession
} from "../sync/use-mastodon-activity";

const EMPTY_ARRAY: never[] = [];

export function useMastodonActivitySurface(enabled = true) {
  const session = useMastodonSession();
  const connected = Boolean(session.data?.connected && session.data.account?.acct);
  const activityEnabled = enabled && connected;
  const homeTimeline = useMastodonHomeTimeline({ enabled: activityEnabled, limit: 20 });
  const notifications = useMastodonNotifications({ enabled: activityEnabled, limit: 20 });
  const accountStatuses = useMastodonAccountStatuses({ enabled: activityEnabled, limit: 10 });
  const bookTokTrends = useBookTokTrends({ enabled });

  const timelineItems = homeTimeline.data?.items ?? EMPTY_ARRAY;
  const notificationItems = notifications.data?.items ?? EMPTY_ARRAY;
  const accountStatusItems = accountStatuses.data?.items ?? EMPTY_ARRAY;
  const trendItems = bookTokTrends.data?.length ? bookTokTrends.data : CURATED_BOOKTOK_TRENDS;
  const trendError = getMastodonActivityErrorState(bookTokTrends.error);
  const activityError = useMemo(() => [
    getMastodonActivityErrorState(session.error),
    getMastodonActivityErrorState(homeTimeline.error),
    getMastodonActivityErrorState(notifications.error),
    getMastodonActivityErrorState(accountStatuses.error)
  ].find(Boolean) ?? null, [session.error, homeTimeline.error, notifications.error, accountStatuses.error]);
  const refreshAll = useCallback(() => {
    void session.refetch();
    if (connected) {
      void homeTimeline.refetch();
      void notifications.refetch();
      void accountStatuses.refetch();
    }
    void bookTokTrends.refetch();
  }, [accountStatuses, bookTokTrends, connected, homeTimeline, notifications, session]);

  return {
    session,
    homeTimeline,
    notifications,
    accountStatuses,
    bookTokTrends,
    connected,
    activityEnabled,
    accountLabel: session.data?.account?.acct ?? "your account",
    timelineItems,
    notificationItems,
    accountStatusItems,
    trendItems,
    trendError,
    activityError,
    isLoadingSession: session.isPending,
    isLoadingActivity: activityEnabled && (
      homeTimeline.isPending || notifications.isPending || accountStatuses.isPending
    ),
    hasAnyActivity: timelineItems.length > 0 || notificationItems.length > 0 || accountStatusItems.length > 0,
    refreshAll
  };
}
