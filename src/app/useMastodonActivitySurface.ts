import { useMemo } from "react";
import { CURATED_BOOKTOK_TRENDS } from "../sync/booktok-trending";
import {
  getMastodonActivityErrorState,
  useBookTokTrends,
  useMastodonAccountStatuses,
  useMastodonHomeTimeline,
  useMastodonNotifications,
  useMastodonSession
} from "../sync/use-mastodon-activity";

export function useMastodonActivitySurface(enabled = true) {
  const session = useMastodonSession();
  const connected = Boolean(session.data?.connected && session.data.account?.acct);
  const activityEnabled = enabled && connected;
  const homeTimeline = useMastodonHomeTimeline({ enabled: activityEnabled, limit: 20 });
  const notifications = useMastodonNotifications({ enabled: activityEnabled, limit: 20 });
  const accountStatuses = useMastodonAccountStatuses({ enabled: activityEnabled, limit: 10 });
  const bookTokTrends = useBookTokTrends({ enabled });

  const timelineItems = homeTimeline.data?.items ?? [];
  const notificationItems = notifications.data?.items ?? [];
  const accountStatusItems = accountStatuses.data?.items ?? [];
  const trendItems = bookTokTrends.data?.length ? bookTokTrends.data : CURATED_BOOKTOK_TRENDS;
  const activityError = useMemo(() => [
    getMastodonActivityErrorState(session.error),
    getMastodonActivityErrorState(homeTimeline.error),
    getMastodonActivityErrorState(notifications.error),
    getMastodonActivityErrorState(accountStatuses.error),
    getMastodonActivityErrorState(bookTokTrends.error)
  ].find(Boolean) ?? null, [session.error, homeTimeline.error, notifications.error, accountStatuses.error, bookTokTrends.error]);

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
    activityError,
    isLoadingSession: session.isLoading || session.isPending,
    isLoadingActivity: activityEnabled && (
      homeTimeline.isLoading || notifications.isLoading || accountStatuses.isLoading ||
      homeTimeline.isPending || notifications.isPending || accountStatuses.isPending
    ),
    hasAnyActivity: timelineItems.length > 0 || notificationItems.length > 0 || accountStatusItems.length > 0
  };
}
