/**
 * Activity Page - hook-driven activity tab.
 *
 * Consumes useActivityTab() internally for all data orchestration
 * (session, timeline, notifications, interactions, compose, refresh).
 * App.tsx no longer owns low-level activity fetch mechanics.
 */

import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SectionHeader } from "../../components/common/SectionHeader";
import { EmptyState } from "../../components/common/EmptyState";
import { Skeleton } from "../../components/common/Skeleton";
import { ComposeSheet } from "../../components/activity/ComposeSheet";
import { ModerationInterventionGate } from "../../components/moderation/ModerationInterventionGate";
import { useActivityTab, hasWriteScope } from "../useActivityTab";
import { usePolicySurface } from "../../hooks/usePolicySurface";
import {
  notificationToModeratableStatus,
  visibleNotifications,
  visibleStatuses
} from "../../moderation/activity-policy-adapter";
import type { MastodonStatus, MastodonNotification } from "../../sync/mastodon-client";

export type StatusRowProps = {
  status: MastodonStatus;
  interaction?: { favourited: boolean; bookmarked: boolean };
  onFavourite?: (id: string, current: boolean) => void;
  onBookmark?: (id: string, current: boolean) => void;
};

export type NotificationRowProps = {
  notification: MastodonNotification;
};

export interface ActivityPageProps {
  /** Render a timeline status row. Shared atom used by shelves/activity. */
  renderStatusRow?: (props: StatusRowProps) => React.ReactNode;
  /** Render a notification row. */
  renderNotificationRow?: (props: NotificationRowProps) => React.ReactNode;
}

function DefaultStatusRow({ status }: StatusRowProps) {
  const text = useMemo(() => {
    const raw = status.content ?? "";
    return raw.replace(/<[^>]*>/g, "").trim() || "Updated their reading activity.";
  }, [status.content]);

  return (
    <article
      style={{
        borderRadius: "var(--radius-md)",
        background: "var(--color-bg-secondary)",
        color: "var(--color-text)",
        padding: "var(--space-4)",
        display: "grid",
        gap: "var(--space-2)",
        boxShadow: "var(--shadow-card)"
      }}
    >
      <strong style={{ fontSize: "var(--text-subhead)", overflowWrap: "anywhere" }}>
        {status.account.display_name || status.account.acct || status.account.username || "Unknown"}
      </strong>
      <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)", lineHeight: "var(--leading-footnote)", overflowWrap: "anywhere" }}>
        {text}
      </p>
    </article>
  );
}

function DefaultNotificationRow({ notification }: NotificationRowProps) {
  const text = useMemo(() => {
    if (!notification.status?.content) return null;
    return notification.status.content.replace(/<[^>]*>/g, "").trim();
  }, [notification.status?.content]);

  const verb = notificationVerb(notification.type);

  return (
    <article
      style={{
        borderRadius: "var(--radius-md)",
        background: "var(--color-bg-elevated)",
        color: "var(--color-text)",
        padding: "var(--space-4)",
        display: "grid",
        gap: "var(--space-2)",
        border: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)"
      }}
    >
      <strong style={{ fontSize: "var(--text-subhead)", overflowWrap: "anywhere" }}>
        {notification.account.display_name || notification.account.acct || notification.account.username || "Unknown"}{" "}
        {verb}
      </strong>
      {text ? (
        <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)", lineHeight: "var(--leading-footnote)", overflowWrap: "anywhere" }}>
          {text}
        </p>
      ) : null}
    </article>
  );
}

function notificationVerb(type: string): string {
  switch (type) {
    case "follow": return "followed you";
    case "favourite": return "favourited your post";
    case "mention": return "mentioned you";
    case "reblog": return "boosted your post";
    case "status": return "posted a new update";
    case "update": return "updated a post";
    default: return type.replace(/_/g, " ");
  }
}

export function ActivityPage({
  renderStatusRow,
  renderNotificationRow
}: ActivityPageProps = {}) {
  const { t, i18n } = useTranslation();
  const activity = useActivityTab();

  const {
    connectedAccount,
    isLoadingSession,
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
    reconnectRequired
  } = activity;

  const { filterItems: filterTimelineItems } = usePolicySurface("home");
  const { filterItems: filterNotificationItems } = usePolicySurface("notifications");

  const moderatedTimeline = useMemo(() => {
    if (timeline.length === 0) return [];
    return visibleStatuses(filterTimelineItems(timeline));
  }, [timeline, filterTimelineItems]);

  const moderatedNotifications = useMemo(() => {
    if (notifications.length === 0) return [];
    const policyInputs = notifications.map(notificationToModeratableStatus);
    return visibleNotifications(filterNotificationItems(policyInputs));
  }, [notifications, filterNotificationItems]);

  const canCompose = connectedAccount !== null && hasWriteScope(connectedAccount.grantedScopes, "write:statuses");
  const canFavourite = connectedAccount !== null && hasWriteScope(connectedAccount.grantedScopes, "write:favourites");
  const canBookmark = connectedAccount !== null && hasWriteScope(connectedAccount.grantedScopes, "write:bookmarks");

  if (isLoadingSession && !connectedAccount) {
    return (
      <div style={{ padding: "0 var(--space-4)", display: "grid", gap: "var(--space-3)" }} aria-label="Loading activity">
        <Skeleton style={{ height: 112, borderRadius: "var(--radius-xl)" }} />
        <Skeleton style={{ height: 96, borderRadius: "var(--radius-lg)" }} />
        <Skeleton style={{ height: 96, borderRadius: "var(--radius-lg)" }} />
      </div>
    );
  }

  if (!connectedAccount) {
    return (
      <EmptyState title={t("activity.signInTitle")} description={t("activity.signInDescription")} />
    );
  }

  return (
    <>
      <div style={{ display: "grid", gap: "var(--space-6)" }}>
        {canCompose ? (
          <div style={{ padding: "0 var(--space-4)" }}>
            <button
              type="button"
              onClick={openCompose}
              style={{
                width: "100%",
                minHeight: "var(--touch-min)",
                border: "1px solid color-mix(in srgb, var(--color-text) 16%, transparent)",
                borderRadius: "var(--radius-lg)",
                background: "var(--color-bg-secondary)",
                color: "var(--color-text-secondary)",
                fontSize: "var(--text-footnote)",
                textAlign: "left",
                padding: "0 var(--space-4)",
                cursor: "pointer"
              }}
            >
              {t("activity.composePrompt")}
            </button>
          </div>
        ) : (
          <div style={{
            margin: "0 var(--space-4)",
            padding: "var(--space-3) var(--space-4)",
            borderRadius: "var(--radius-md)",
            background: "color-mix(in srgb, var(--color-accent) 8%, var(--color-bg))",
            border: "1px solid color-mix(in srgb, var(--color-accent) 18%, transparent)",
            display: "grid",
            gap: "var(--space-2)"
          }}>
            <strong style={{ fontSize: "var(--text-subhead)" }}>{t("activity.enablePostingTitle")}</strong>
            <p style={{ margin: 0, fontSize: "var(--text-footnote)", color: "var(--color-text-secondary)" }}>
              {t("activity.enablePostingDescription")}
            </p>
          </div>
        )}

        {reconnectRequired ? (
          <div
            role="status"
            style={{
              margin: "0 var(--space-4)",
              borderRadius: "var(--radius-lg)",
              background: "var(--color-bg-elevated)",
              border: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)",
              padding: "var(--space-4)",
              display: "flex",
              justifyContent: "space-between",
              gap: "var(--space-3)",
              alignItems: "center"
            }}
          >
            <span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)", lineHeight: "var(--leading-footnote)" }}>
              {activityErrorState?.message ?? t("activity.sessionExpired")}
            </span>
            <button
              type="button"
              onClick={refresh}
              style={{
                border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)",
                background: "var(--color-bg-elevated)",
                color: "var(--color-text)",
                borderRadius: "999px",
                padding: "var(--space-2) var(--space-3)",
                fontSize: "var(--text-footnote)",
                fontWeight: 700,
                minHeight: 36,
                cursor: "pointer"
              }}
            >
              {t("action.reconnect", { defaultValue: "Reconnect" })}
            </button>
          </div>
        ) : null}

        {!reconnectRequired && activityErrorState?.kind === "rate-limited" ? (
          <div
            role="status"
            style={{
              margin: "0 var(--space-4)",
              borderRadius: "var(--radius-lg)",
              background: "var(--color-bg-elevated)",
              border: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)",
              padding: "var(--space-4)",
              display: "flex",
              justifyContent: "space-between",
              gap: "var(--space-3)",
              alignItems: "center"
            }}
          >
            <span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)", lineHeight: "var(--leading-footnote)" }}>
              {activityErrorState.message}
            </span>
            <button
              type="button"
              onClick={refresh}
              style={{
                border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)",
                background: "var(--color-bg-elevated)",
                color: "var(--color-text)",
                borderRadius: "999px",
                padding: "var(--space-2) var(--space-3)",
                fontSize: "var(--text-footnote)",
                fontWeight: 700,
                minHeight: 36,
                cursor: "pointer"
              }}
            >
              {t("action.retry", { defaultValue: "Try again" })}
            </button>
          </div>
        ) : null}

        <section style={{ display: "grid", gap: "var(--space-3)" }}>
          <SectionHeader
            title={t("activity.notifications")}
            actionLabel={isLoadingActivity ? undefined : t("action.refresh")}
            onAction={isLoadingActivity ? undefined : refresh}
          />
          <div style={{ display: "grid", gap: "var(--space-3)", padding: "0 var(--space-4)" }}>
            {isLoadingActivity && notifications.length === 0 ? (
              <>
                <Skeleton style={{ height: 92 }} />
                <Skeleton style={{ height: 92 }} />
              </>
            ) : moderatedNotifications.length > 0 ? (
              moderatedNotifications.map((result) => (
                <ModerationInterventionGate key={result.notification.id} decision={result.decision}>
                  {renderNotificationRow
                    ? renderNotificationRow({ notification: result.notification })
                    : <DefaultNotificationRow notification={result.notification} />}
                </ModerationInterventionGate>
              ))
            ) : (
              <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                {t("activity.noNotifications")}
              </p>
            )}
          </div>
        </section>

        <section style={{ display: "grid", gap: "var(--space-3)" }}>
          <SectionHeader title={t("activity.homeTimeline")} />
          <div style={{ display: "grid", gap: "var(--space-3)", padding: "0 var(--space-4)" }}>
            {isLoadingActivity && timeline.length === 0 ? (
              <>
                <Skeleton style={{ height: 120 }} />
                <Skeleton style={{ height: 120 }} />
                <Skeleton style={{ height: 120 }} />
              </>
            ) : moderatedTimeline.length > 0 ? (
              moderatedTimeline.map((result) => {
                const status = result.item;
                const interaction = statusInteractions.get(status.id);
                return (
                  <ModerationInterventionGate key={status.id} decision={result.decision}>
                    {renderStatusRow
                      ? renderStatusRow({
                          status,
                          interaction,
                          onFavourite: canFavourite ? handleFavourite : undefined,
                          onBookmark: canBookmark ? handleBookmark : undefined
                        })
                      : <DefaultStatusRow
                          status={status}
                          interaction={interaction}
                          onFavourite={canFavourite ? handleFavourite : undefined}
                          onBookmark={canBookmark ? handleBookmark : undefined}
                        />}
                  </ModerationInterventionGate>
                );
              })
            ) : (
              <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                {t("activity.noTimelinePosts")}
              </p>
            )}
          </div>
        </section>

        {activityError && !reconnectRequired && activityErrorState?.kind !== "rate-limited" ? (
          <p style={{ margin: "0 var(--space-4)", color: "#c23b3b", fontSize: "var(--text-footnote)" }}>
            {activityError}
          </p>
        ) : loadedAt ? (
          <p style={{ margin: "0 var(--space-4)", color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
            {t("activity.lastUpdatedAt", { date: new Date(loadedAt).toLocaleString(i18n.language) })}
          </p>
        ) : null}
      </div>

      {composeOpen && connectedAccount ? (
        <ComposeSheet
          onClose={closeCompose}
          onPost={handlePosted}
        />
      ) : null}
    </>
  );
}
