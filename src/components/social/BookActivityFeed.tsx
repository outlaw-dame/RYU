/**
 * Phase 31 - BookActivityFeed component.
 *
 * Book-centered activity feed showing grouped activities.
 * Activities about the same book are visually grouped together.
 */

import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { MastodonStatus } from "../../sync/mastodon-client";
import type { ActivityFilter, BookActivity, ActivityGroup } from "../../social/types";
import { useBookActivity } from "../../hooks/useBookActivity";
import { ActivityFilterBar } from "./ActivityFilterBar";

export type BookActivityFeedProps = {
  /** Raw timeline statuses. */
  statuses: MastodonStatus[];
  /** Optional initial filter. */
  initialFilter?: ActivityFilter;
  /** Render override for a single activity item. */
  renderActivity?: (activity: BookActivity) => React.ReactNode;
  /** Render override for a group header. */
  renderGroupHeader?: (group: ActivityGroup) => React.ReactNode;
};

/**
 * Default activity item renderer.
 */
function DefaultActivityItem({ activity }: { activity: BookActivity }) {
  const { t } = useTranslation();
  const text = useMemo(() => {
    const raw = activity.status.content ?? "";
    return raw.replace(/<[^>]*>/g, "").trim() || t("social.readingActivity", { defaultValue: "Updated their reading activity." });
  }, [activity.status.content, t]);

  const typeLabel = getActivityTypeLabel(activity.activityType, t);

  return (
    <article
      style={{
        borderRadius: "var(--radius-md)",
        background: "var(--color-bg-secondary)",
        color: "var(--color-text)",
        padding: "var(--space-3) var(--space-4)",
        display: "grid",
        gap: "var(--space-2)"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <strong style={{ fontSize: "var(--text-subhead)", overflowWrap: "anywhere", flex: 1 }}>
          {activity.status.account.display_name || activity.status.account.acct || "Unknown"}
        </strong>
        {activity.isBookRelated ? (
          <span
            style={{
              fontSize: "var(--text-caption2, 10px)",
              background: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
              color: "var(--color-accent)",
              borderRadius: "var(--radius-sm, 4px)",
              padding: "2px 6px",
              fontWeight: 500
            }}
          >
            {typeLabel}
          </span>
        ) : null}
      </div>
      <p
        style={{
          margin: 0,
          color: "var(--color-text-secondary)",
          fontSize: "var(--text-footnote)",
          lineHeight: "var(--leading-footnote)",
          overflowWrap: "anywhere"
        }}
      >
        {text}
      </p>
    </article>
  );
}

/**
 * Default group header renderer.
 */
function DefaultGroupHeader({ group }: { group: ActivityGroup }) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "var(--space-2) 0"
      }}
    >
      <span style={{ fontSize: "var(--text-footnote)", fontWeight: 600, color: "var(--color-text)" }}>
        {group.label}
      </span>
      {group.authorCount > 1 ? (
        <span style={{ fontSize: "var(--text-caption1)", color: "var(--color-text-tertiary)" }}>
          {t("social.groupAuthorCount", { count: group.authorCount, defaultValue: "{{count}} people" })}
        </span>
      ) : null}
    </div>
  );
}

export function BookActivityFeed({
  statuses,
  initialFilter,
  renderActivity,
  renderGroupHeader
}: BookActivityFeedProps) {
  const { t } = useTranslation();
  const {
    filter,
    setFilter,
    groups,
    ungrouped,
    bookRelatedCount,
    totalCount
  } = useBookActivity(statuses, { initialFilter });

  const hasContent = groups.length > 0 || ungrouped.length > 0;

  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      <ActivityFilterBar
        activeFilter={filter}
        onFilterChange={setFilter}
        bookCount={bookRelatedCount}
      />

      <div style={{ padding: "0 var(--space-4)", display: "grid", gap: "var(--space-4)" }}>
        {!hasContent && totalCount === 0 ? (
          <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
            {t("social.noActivity", { defaultValue: "No activity yet." })}
          </p>
        ) : !hasContent ? (
          <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
            {t("social.noMatchingActivity", { defaultValue: "No matching activity for this filter." })}
          </p>
        ) : null}

        {/* Grouped book activities */}
        {groups.map((group) => (
          <section key={group.groupKey} style={{ display: "grid", gap: "var(--space-2)" }}>
            {renderGroupHeader
              ? renderGroupHeader(group)
              : <DefaultGroupHeader group={group} />}
            {group.activities.map((activity) => (
              <React.Fragment key={activity.status.id}>
                {renderActivity
                  ? renderActivity(activity)
                  : <DefaultActivityItem activity={activity} />}
              </React.Fragment>
            ))}
          </section>
        ))}

        {/* Ungrouped (non-book) activities */}
        {ungrouped.length > 0 ? (
          <section style={{ display: "grid", gap: "var(--space-2)" }}>
            <div style={{ padding: "var(--space-2) 0" }}>
              <span style={{ fontSize: "var(--text-footnote)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                {t("social.otherActivity", { defaultValue: "Other Activity" })}
              </span>
            </div>
            {ungrouped.map((activity) => (
              <React.Fragment key={activity.status.id}>
                {renderActivity
                  ? renderActivity(activity)
                  : <DefaultActivityItem activity={activity} />}
              </React.Fragment>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function getActivityTypeLabel(
  type: string,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  switch (type) {
    case "review":
      return t("social.typeReview", { defaultValue: "Review" });
    case "rating":
      return t("social.typeRating", { defaultValue: "Rating" });
    case "reading-update":
      return t("social.typeReadingUpdate", { defaultValue: "Reading" });
    case "recommendation":
      return t("social.typeRecommendation", { defaultValue: "Rec" });
    case "discussion":
      return t("social.typeDiscussion", { defaultValue: "Discussion" });
    default:
      return "";
  }
}
