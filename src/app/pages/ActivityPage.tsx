/**
 * Phase 23 — Activity Page component.
 *
 * The Activity tab showing timeline, notifications,
 * and compose access for connected accounts.
 */

import { useTranslation } from "react-i18next";
import { PageShell } from "../../components/layout/PageShell";
import { SectionHeader } from "../../components/common/SectionHeader";
import { EmptyState } from "../../components/common/EmptyState";
import { SkeletonCoverGrid } from "../../components/common/Skeleton";
import type { MastodonStatus, MastodonNotification } from "../../sync/mastodon-client";


export interface ActivityPageProps {
  connected: boolean;
  canCompose: boolean;
  timeline: MastodonStatus[];
  notifications: MastodonNotification[];
  loading: boolean;
  error: string | null;
  loadedAt: number | null;
  onRefresh: () => void;
  onCompose: () => void;
  onFavourite: (statusId: string, currentState: boolean) => void;
  onBookmark: (statusId: string, currentState: boolean) => void;
  statusInteractions: Map<string, { favourited: boolean; bookmarked: boolean }>;
  importedBooks: Array<{ id: string; title: string; author?: string; coverUrl?: string }>;
  renderStatusRow: (props: {
    status: MastodonStatus;
    importedBooks: Array<{ id: string; title: string; author?: string; coverUrl?: string }>;
    favourited: boolean;
    bookmarked: boolean;
    onFavourite: (statusId: string, currentState: boolean) => void;
    onBookmark: (statusId: string, currentState: boolean) => void;
  }) => React.ReactNode;
  renderNotificationRow: (notification: MastodonNotification) => React.ReactNode;
}


export function ActivityPage({
  connected,
  canCompose,
  timeline,
  notifications,
  loading,
  error,
  loadedAt,
  onRefresh,
  onCompose,
  onFavourite,
  onBookmark,
  statusInteractions,
  importedBooks,
  renderStatusRow,
  renderNotificationRow
}: ActivityPageProps) {
  const { t, i18n } = useTranslation();

  return (
    <PageShell
      title={t("screen.activity")}
      id="panel-activity"
      role="tabpanel"
      aria-labelledby="tab-activity"
    >
      {!connected ? (
        <EmptyState title={t("activity.signInTitle")} description={t("activity.signInDescription")} />
      ) : (
        <div style={{ display: "grid", gap: "var(--space-6)" }}>
          {canCompose ? (
            <div style={{ padding: "0 var(--space-4)" }}>
              <button
                type="button"
                onClick={onCompose}
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
          ) : null}


          <section style={{ display: "grid", gap: "var(--space-3)" }}>
            <SectionHeader
              title={t("activity.timeline")}
              actionLabel={loading ? undefined : t("action.refresh")}
              onAction={loading ? undefined : onRefresh}
            />
            <div style={{ display: "grid", gap: "var(--space-3)", padding: "0 var(--space-4)" }}>
              {loading && timeline.length === 0 ? (
                <SkeletonCoverGrid count={3} />
              ) : timeline.length > 0 ? (
                timeline.map((status) => {
                  const interaction = statusInteractions.get(status.id);
                  return renderStatusRow({
                    status,
                    importedBooks,
                    favourited: interaction?.favourited ?? Boolean((status as any).favourited),
                    bookmarked: interaction?.bookmarked ?? Boolean((status as any).bookmarked),
                    onFavourite,
                    onBookmark
                  });
                })
              ) : (
                <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                  {t("activity.emptyTimeline")}
                </p>
              )}
            </div>
          </section>

          {notifications.length > 0 ? (
            <section style={{ display: "grid", gap: "var(--space-3)" }}>
              <SectionHeader title={t("activity.notifications")} />
              <div style={{ display: "grid", gap: "var(--space-3)", padding: "0 var(--space-4)" }}>
                {notifications.map((notification) => renderNotificationRow(notification))}
              </div>
            </section>
          ) : null}

          {error ? (
            <p style={{ margin: "0 var(--space-4)", color: "#c23b3b", fontSize: "var(--text-footnote)" }}>
              {error}
            </p>
          ) : loadedAt ? (
            <p style={{ margin: "0 var(--space-4)", color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
              {t("activity.updatedAt", { date: new Date(loadedAt).toLocaleString(i18n.language) })}
            </p>
          ) : null}
        </div>
      )}
    </PageShell>
  );
}
