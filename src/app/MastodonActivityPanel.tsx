import { useMemo, type CSSProperties, type ReactNode } from "react";
import { EmptyState } from "../components/common/EmptyState";
import { SectionHeader } from "../components/common/SectionHeader";
import { Skeleton } from "../components/common/Skeleton";
import { sanitizeUrl, stripHtml } from "../lib/sanitize";
import { CURATED_BOOKTOK_TRENDS, type BookTokTrend } from "../sync/booktok-trending";
import type { MastodonNotification, MastodonStatus } from "../sync/mastodon-client";
import {
  getMastodonActivityErrorState,
  useBookTokTrends,
  useDisconnectMastodon,
  useMastodonAccountStatuses,
  useMastodonHomeTimeline,
  useMastodonNotifications,
  useMastodonSession
} from "../sync/use-mastodon-activity";

export type MastodonActivityPanelProps = {
  enabled?: boolean;
  onConnect: () => void;
  onReconnect?: () => void;
};

export function MastodonActivityPanel({
  enabled = true,
  onConnect,
  onReconnect = onConnect
}: MastodonActivityPanelProps) {
  const session = useMastodonSession();
  const connected = Boolean(session.data?.connected && session.data.account?.acct);
  const activityEnabled = enabled && connected;
  const homeTimeline = useMastodonHomeTimeline({ enabled: activityEnabled, limit: 20 });
  const notifications = useMastodonNotifications({ enabled: activityEnabled, limit: 20 });
  const accountStatuses = useMastodonAccountStatuses({ enabled: activityEnabled, limit: 10 });
  const bookTokTrends = useBookTokTrends({ enabled });
  const disconnect = useDisconnectMastodon();

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
  ].find(Boolean) ?? null, [
    session.error,
    homeTimeline.error,
    notifications.error,
    accountStatuses.error,
    bookTokTrends.error
  ]);
  const isLoadingSession = session.isLoading || session.isPending;
  const isLoadingActivity = connected && (
    homeTimeline.isLoading || notifications.isLoading || accountStatuses.isLoading ||
    homeTimeline.isPending || notifications.isPending || accountStatuses.isPending
  );
  const hasAnyActivity = timelineItems.length > 0 || notificationItems.length > 0 || accountStatusItems.length > 0;
  const accountLabel = session.data?.account?.acct ?? "your account";

  const refreshAll = () => {
    void session.refetch();
    if (connected) {
      void homeTimeline.refetch();
      void notifications.refetch();
      void accountStatuses.refetch();
    }
    void bookTokTrends.refetch();
  };

  const disconnectAccount = () => {
    void disconnect.mutateAsync();
  };

  if (isLoadingSession) {
    return <ActivitySkeleton />;
  }

  if (!connected) {
    return (
      <ActivityShell>
        <section style={{ display: "grid", gap: "var(--space-4)", padding: "0 var(--space-4)" }}>
          <EmptyState
            title="Connect your account"
            description="Bring in your reading timeline, replies, and notifications without turning RYU into a generic social feed."
          />
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button type="button" onClick={onConnect} style={primaryButtonStyle}>Connect account</button>
          </div>
        </section>
      </ActivityShell>
    );
  }

  const reconnectRequired = activityError?.reconnectRequired;

  return (
    <ActivityShell>
      <section style={{ display: "grid", gap: "var(--space-4)", padding: "0 var(--space-4)" }}>
        <header style={{
          borderRadius: "var(--radius-xl)",
          background: "var(--color-bg-secondary)",
          color: "var(--color-text)",
          padding: "var(--space-4)",
          boxShadow: "var(--shadow-card)",
          display: "grid",
          gap: "var(--space-3)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "start" }}>
            <div style={{ display: "grid", gap: "var(--space-1)" }}>
              <span style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Reading network
              </span>
              <strong style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-title3)", overflowWrap: "anywhere" }}>
                Connected as {accountLabel}
              </strong>
            </div>
            <button
              type="button"
              onClick={disconnectAccount}
              disabled={disconnect.isPending}
              style={secondaryButtonStyle}
            >
              {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
          <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)", lineHeight: "var(--leading-footnote)" }}>
            Account activity is treated as context for books, shelves, and discovery—not as the product identity.
          </p>
        </header>

        {activityError ? (
          <ActivityNotice
            message={activityError.message}
            actionLabel={reconnectRequired ? "Reconnect" : "Try again"}
            onAction={reconnectRequired ? onReconnect : refreshAll}
          />
        ) : null}
      </section>

      {isLoadingActivity ? <ActivitySkeletonCards /> : null}

      {!isLoadingActivity && !hasAnyActivity ? (
        <section style={{ display: "grid", gap: "var(--space-4)", padding: "0 var(--space-4)" }}>
          <EmptyState
            title="Nothing new yet"
            description="When your reading network has new posts or notifications, they’ll appear here."
          />
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button type="button" onClick={refreshAll} style={secondaryButtonStyle}>Refresh</button>
          </div>
        </section>
      ) : null}

      {!isLoadingActivity && timelineItems.length > 0 ? (
        <ActivityList title="Home timeline">
          {timelineItems.map((status) => <ActivityStatusRow key={status.id} status={status} />)}
        </ActivityList>
      ) : null}

      {!isLoadingActivity && notificationItems.length > 0 ? (
        <ActivityList title="Notifications">
          {notificationItems.map((notification) => <ActivityNotificationRow key={notification.id} notification={notification} />)}
        </ActivityList>
      ) : null}

      {!isLoadingActivity && accountStatusItems.length > 0 ? (
        <ActivityList title="Your recent posts">
          {accountStatusItems.map((status) => <ActivityStatusRow key={status.id} status={status} />)}
        </ActivityList>
      ) : null}

      <BookTokTrendRail trends={trendItems} loading={bookTokTrends.isLoading || bookTokTrends.isPending} />
    </ActivityShell>
  );
}

function ActivityShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      {children}
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <ActivityShell>
      <section style={{ padding: "0 var(--space-4)", display: "grid", gap: "var(--space-3)" }} aria-label="Loading activity">
        <Skeleton style={{ height: 112, borderRadius: "var(--radius-xl)" }} />
        <ActivitySkeletonCards />
      </section>
    </ActivityShell>
  );
}

function ActivitySkeletonCards() {
  return (
    <section style={{ padding: "0 var(--space-4)", display: "grid", gap: "var(--space-3)" }} aria-label="Loading account activity">
      <Skeleton style={{ height: 96, borderRadius: "var(--radius-lg)" }} />
      <Skeleton style={{ height: 96, borderRadius: "var(--radius-lg)" }} />
      <Skeleton style={{ height: 96, borderRadius: "var(--radius-lg)" }} />
    </section>
  );
}

function ActivityNotice({ message, actionLabel, onAction }: { message: string; actionLabel: string; onAction: () => void }) {
  return (
    <div role="status" style={{
      borderRadius: "var(--radius-lg)",
      background: "var(--color-bg-elevated)",
      border: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)",
      padding: "var(--space-4)",
      display: "flex",
      justifyContent: "space-between",
      gap: "var(--space-3)",
      alignItems: "center"
    }}>
      <span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)", lineHeight: "var(--leading-footnote)" }}>{message}</span>
      <button type="button" onClick={onAction} style={secondaryButtonStyle}>{actionLabel}</button>
    </div>
  );
}

function ActivityList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: "grid", gap: "var(--space-3)" }}>
      <SectionHeader title={title} />
      <div style={{ display: "grid", gap: "var(--space-3)", padding: "0 var(--space-4)" }}>
        {children}
      </div>
    </section>
  );
}

function ActivityStatusRow({ status }: { status: MastodonStatus }) {
  const href = useMemo(() => sanitizeUrl(status.url ?? status.uri ?? null), [status.url, status.uri]);
  const text = useMemo(() => mastodonStatusText(status), [status]);

  return (
    <article style={activityCardStyle}>
      <ActivityCardHeader label={mastodonAccountLabel(status.account)} createdAt={status.created_at} />
      <p style={activityTextStyle}>{text}</p>
      {href ? <ActivityLink href={href} label="Open post" /> : null}
    </article>
  );
}

function ActivityNotificationRow({ notification }: { notification: MastodonNotification }) {
  const statusText = useMemo(() => notification.status ? mastodonStatusText(notification.status) : null, [notification.status]);
  const href = useMemo(
    () => sanitizeUrl(notification.status?.url ?? notification.status?.uri ?? null),
    [notification.status?.url, notification.status?.uri]
  );

  return (
    <article style={activityCardStyle}>
      <ActivityCardHeader
        label={`${mastodonAccountLabel(notification.account)} ${notificationVerb(notification.type)}`}
        createdAt={notification.created_at}
      />
      {statusText ? <p style={activityTextStyle}>{statusText}</p> : null}
      {href ? <ActivityLink href={href} label="Open post" /> : null}
    </article>
  );
}

function ActivityCardHeader({ label, createdAt }: { label: string; createdAt: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "baseline" }}>
      <strong style={{ fontSize: "var(--text-subhead)", overflowWrap: "anywhere" }}>{label}</strong>
      <span style={{ flex: "0 0 auto", color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
        {formatActivityDate(createdAt)}
      </span>
    </div>
  );
}

function BookTokTrendRail({ trends, loading }: { trends: BookTokTrend[]; loading: boolean }) {
  const visibleTrends = useMemo(() => trends.slice(0, 6), [trends]);

  return (
    <section style={{ display: "grid", gap: "var(--space-3)" }}>
      <SectionHeader title="BookTok signals" actionLabel={loading ? "Refreshing…" : undefined} />
      <div style={{
        display: "grid",
        gridAutoFlow: "column",
        gridAutoColumns: "minmax(172px, 44vw)",
        gap: "var(--space-3)",
        overflowX: "auto",
        padding: "0 var(--space-4) var(--space-1)",
        scrollSnapType: "x mandatory"
      }}>
        {visibleTrends.map((trend) => (
          <article key={trend.id} style={{
            ...activityCardStyle,
            minHeight: 124,
            scrollSnapAlign: "start"
          }}>
            <strong style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-headline)", lineHeight: "var(--leading-headline)" }}>{trend.title}</strong>
            {trend.author ? <span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>{trend.author}</span> : null}
            {trend.reason ? <p style={activityTextStyle}>{trend.reason}</p> : null}
            {typeof trend.mentionCount === "number" ? (
              <span style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
                {trend.mentionCount.toLocaleString()} mentions
              </span>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function ActivityLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: "var(--color-accent)", fontSize: "var(--text-footnote)", fontWeight: 600 }}>
      {label}
    </a>
  );
}

const activityDateFormatter = new Intl.DateTimeFormat([], {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

function formatActivityDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return activityDateFormatter.format(date);
}

function mastodonAccountLabel(account: MastodonStatus["account"]): string {
  return account.display_name || account.acct || account.username || "Unknown account";
}

function mastodonStatusText(status: MastodonStatus): string {
  const text = stripHtml(status.content ?? "");
  if (text) return text;
  if (status.spoiler_text) return status.spoiler_text;
  return "Updated their reading activity.";
}

function notificationVerb(type: string): string {
  switch (type) {
    case "follow":
      return "followed you";
    case "favourite":
      return "favourited your post";
    case "mention":
      return "mentioned you";
    case "reblog":
      return "boosted your post";
    case "status":
      return "posted a new update";
    case "update":
      return "updated a post";
    default:
      return type.replace(/_/g, " ");
  }
}

const activityCardStyle: CSSProperties = {
  borderRadius: "var(--radius-lg)",
  background: "var(--color-bg-secondary)",
  color: "var(--color-text)",
  padding: "var(--space-4)",
  display: "grid",
  gap: "var(--space-2)",
  boxShadow: "var(--shadow-card)"
};

const activityTextStyle: CSSProperties = {
  margin: 0,
  color: "var(--color-text-secondary)",
  fontSize: "var(--text-footnote)",
  lineHeight: "var(--leading-footnote)",
  overflowWrap: "anywhere"
};

const primaryButtonStyle: CSSProperties = {
  border: 0,
  background: "var(--color-accent)",
  color: "white",
  borderRadius: "999px",
  padding: "var(--space-3) var(--space-5)",
  fontSize: "var(--text-body)",
  fontWeight: 700,
  minHeight: 44,
  cursor: "pointer"
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)",
  background: "var(--color-bg-elevated)",
  color: "var(--color-text)",
  borderRadius: "999px",
  padding: "var(--space-2) var(--space-3)",
  fontSize: "var(--text-footnote)",
  fontWeight: 700,
  minHeight: 36,
  cursor: "pointer"
};
