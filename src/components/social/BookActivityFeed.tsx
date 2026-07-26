/**
 * Phase 31 / Moderation Phase 6 completion - BookActivityFeed component.
 * Canonical moderation runs before classification, grouping, counters, or rendering.
 */

import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { MastodonStatus } from "../../sync/mastodon-client";
import type { ActivityFilter, BookActivity, ActivityGroup } from "../../social/types";
import { classifyActivities } from "../../social/activity-classifier";
import { useBookActivity } from "../../hooks/useBookActivity";
import { usePolicySurface } from "../../hooks/usePolicySurface";
import { ModerationInterventionGate } from "../moderation/ModerationInterventionGate";
import {
  buildBookActivityContentIdentity,
  buildBookActivityRenderKey,
  projectBookActivityPolicy
} from "../../moderation/book-activity-policy";
import { ActivityFilterBar } from "./ActivityFilterBar";

export type BookActivityFeedProps = {
  statuses: MastodonStatus[];
  initialFilter?: ActivityFilter;
  renderActivity?: (activity: BookActivity) => React.ReactNode;
  renderGroupHeader?: (group: ActivityGroup) => React.ReactNode;
};

function DefaultActivityItem({ activity }: { activity: BookActivity }) {
  const { t } = useTranslation();
  const text = useMemo(() => {
    const raw = activity.status.content ?? "";
    return raw.replace(/<[^>]*>/g, "").trim()
      || t("social.readingActivity", { defaultValue: "Updated their reading activity." });
  }, [activity.status.content, t]);
  const typeLabel = getActivityTypeLabel(activity.activityType, t);

  return (
    <article style={{ borderRadius: "var(--radius-md)", background: "var(--color-bg-secondary)", color: "var(--color-text)", padding: "var(--space-3) var(--space-4)", display: "grid", gap: "var(--space-2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <strong style={{ fontSize: "var(--text-subhead)", overflowWrap: "anywhere", flex: 1 }}>
          {activity.status.account?.display_name || activity.status.account?.acct || "Unknown"}
        </strong>
        {activity.isBookRelated ? <span style={{ fontSize: "var(--text-caption2, 10px)", background: "color-mix(in srgb, var(--color-accent) 12%, transparent)", color: "var(--color-accent)", borderRadius: "var(--radius-sm, 4px)", padding: "2px 6px", fontWeight: 500 }}>{typeLabel}</span> : null}
      </div>
      <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)", lineHeight: "var(--leading-footnote)", overflowWrap: "anywhere" }}>{text}</p>
    </article>
  );
}

function DefaultGroupHeader({ group }: { group: ActivityGroup }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-2) 0" }}>
      <span style={{ fontSize: "var(--text-footnote)", fontWeight: 600, color: "var(--color-text)" }}>{group.label}</span>
      {group.authorCount > 1 ? <span style={{ fontSize: "var(--text-caption1)", color: "var(--color-text-tertiary)" }}>{t("social.groupAuthorCount", { count: group.authorCount, defaultValue: "{{count}} people" })}</span> : null}
    </div>
  );
}

export function BookActivityFeed({ statuses, initialFilter, renderActivity, renderGroupHeader }: BookActivityFeedProps) {
  const { t } = useTranslation();
  const { filterItems } = usePolicySurface("public");
  const projection = useMemo(() => projectBookActivityPolicy(filterItems(statuses)), [filterItems, statuses]);
  const { filter, setFilter, groups, ungrouped, bookRelatedCount, totalCount } = useBookActivity(projection.showStatuses, { initialFilter });

  // Intervention content is classified only to render the individual card. It is
  // never grouped and never contributes content-derived labels or counters.
  const interventionActivities = useMemo(
    () => filterActivities(classifyActivities(projection.interventionStatuses), filter),
    [filter, projection.interventionStatuses]
  );
  const hasContent = groups.length > 0 || ungrouped.length > 0 || interventionActivities.length > 0;

  const renderModeratedActivity = (activity: BookActivity) => {
    const decision = projection.decisionByStatus.get(activity.status);
    if (!decision) return null;
    const rendered = renderActivity ? renderActivity(activity) : <DefaultActivityItem activity={activity} />;
    return <ModerationInterventionGate decision={decision} contentIdentity={buildBookActivityContentIdentity(activity.status)}>{rendered}</ModerationInterventionGate>;
  };

  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      <ActivityFilterBar activeFilter={filter} onFilterChange={setFilter} bookCount={bookRelatedCount} />
      <div style={{ padding: "0 var(--space-4)", display: "grid", gap: "var(--space-4)" }}>
        {!hasContent && totalCount === 0 ? <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>{t("social.noActivity", { defaultValue: "No activity yet." })}</p> : !hasContent ? <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>{t("social.noMatchingActivity", { defaultValue: "No matching activity for this filter." })}</p> : null}
        {groups.map((group) => <section key={group.groupKey} style={{ display: "grid", gap: "var(--space-2)" }}>
          {renderGroupHeader ? renderGroupHeader(group) : <DefaultGroupHeader group={group} />}
          {group.activities.map((activity) => <React.Fragment key={buildBookActivityRenderKey(activity.status)}>{renderModeratedActivity(activity)}</React.Fragment>)}
        </section>)}
        {ungrouped.length > 0 ? <section style={{ display: "grid", gap: "var(--space-2)" }}>
          <div style={{ padding: "var(--space-2) 0" }}><span style={{ fontSize: "var(--text-footnote)", fontWeight: 600, color: "var(--color-text-secondary)" }}>{t("social.otherActivity", { defaultValue: "Other Activity" })}</span></div>
          {ungrouped.map((activity) => <React.Fragment key={buildBookActivityRenderKey(activity.status)}>{renderModeratedActivity(activity)}</React.Fragment>)}
        </section> : null}
        {interventionActivities.map((activity) => <React.Fragment key={`intervention:${buildBookActivityRenderKey(activity.status)}`}>{renderModeratedActivity(activity)}</React.Fragment>)}
      </div>
    </div>
  );
}

function filterActivities(activities: BookActivity[], filter: ActivityFilter): BookActivity[] {
  switch (filter) {
    case "books": return activities.filter((activity) => activity.isBookRelated);
    case "reviews": return activities.filter((activity) => activity.activityType === "review" || activity.activityType === "rating");
    case "recommendations": return activities.filter((activity) => activity.activityType === "recommendation");
    default: return activities;
  }
}

function getActivityTypeLabel(type: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  switch (type) {
    case "review": return t("social.typeReview", { defaultValue: "Review" });
    case "rating": return t("social.typeRating", { defaultValue: "Rating" });
    case "reading-update": return t("social.typeReadingUpdate", { defaultValue: "Reading" });
    case "recommendation": return t("social.typeRecommendation", { defaultValue: "Rec" });
    case "discussion": return t("social.typeDiscussion", { defaultValue: "Discussion" });
    default: return "";
  }
}
