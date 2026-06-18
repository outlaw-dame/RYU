/**
 * Phase 31 - useBookActivity hook.
 *
 * Takes timeline items and returns them classified and grouped by book,
 * with filtering controls (show-all vs book-only vs reviews-only).
 */

import { useMemo, useState, useCallback } from "react";
import type { MastodonStatus } from "../sync/mastodon-client";
import { classifyActivities } from "../social/activity-classifier";
import { groupActivities, getUngroupedActivities } from "../social/activity-grouper";
import { filterCacheableStatuses } from "../social/visibility-guard";
import type { BookActivity, ActivityGroup, ActivityFilter } from "../social/types";

export type UseBookActivityResult = {
  /** Current filter. */
  filter: ActivityFilter;
  /** Set the activity filter. */
  setFilter: (filter: ActivityFilter) => void;
  /** All classified activities. */
  allActivities: BookActivity[];
  /** Activities matching the current filter. */
  filteredActivities: BookActivity[];
  /** Grouped book-related activities (based on current filter). */
  groups: ActivityGroup[];
  /** Non-book activities (only present when filter is "all"). */
  ungrouped: BookActivity[];
  /** Count of book-related activities in the full set. */
  bookRelatedCount: number;
  /** Count of total activities. */
  totalCount: number;
};

/**
 * Filter activities by the current filter setting.
 */
function applyFilter(activities: BookActivity[], filter: ActivityFilter): BookActivity[] {
  switch (filter) {
    case "all":
      return activities;
    case "books":
      return activities.filter((a) => a.isBookRelated);
    case "reviews":
      return activities.filter(
        (a) => a.activityType === "review" || a.activityType === "rating"
      );
    case "recommendations":
      return activities.filter((a) => a.activityType === "recommendation");
    case "following":
      // "Following" shows all statuses (this filter is about source, not content type).
      // Since we only receive home timeline items (already following-filtered), show all.
      return activities;
    default:
      return activities;
  }
}

/**
 * Hook that processes timeline statuses into classified, grouped book activities.
 *
 * @param statuses - Raw timeline statuses from the Mastodon API
 * @param options - Optional configuration
 */
export function useBookActivity(
  statuses: MastodonStatus[],
  options: { initialFilter?: ActivityFilter } = {}
): UseBookActivityResult {
  const { initialFilter = "all" } = options;
  const [filter, setFilterState] = useState<ActivityFilter>(initialFilter);

  const setFilter = useCallback((newFilter: ActivityFilter) => {
    setFilterState(newFilter);
  }, []);

  // Classify all statuses
  const allActivities = useMemo(
    () => classifyActivities(statuses),
    [statuses]
  );

  // Apply current filter
  const filteredActivities = useMemo(
    () => applyFilter(allActivities, filter),
    [allActivities, filter]
  );

  // Group filtered activities
  const groups = useMemo(
    () => groupActivities(filteredActivities),
    [filteredActivities]
  );

  // Get ungrouped (non-book) activities
  const ungrouped = useMemo(
    () => (filter === "all" ? getUngroupedActivities(allActivities) : []),
    [allActivities, filter]
  );

  const bookRelatedCount = useMemo(
    () => allActivities.filter((a) => a.isBookRelated).length,
    [allActivities]
  );

  return {
    filter,
    setFilter,
    allActivities,
    filteredActivities,
    groups,
    ungrouped,
    bookRelatedCount,
    totalCount: allActivities.length
  };
}

/**
 * Utility: get statuses eligible for local cache from a timeline.
 * This respects visibility rules and can be used by cache/sync layers.
 */
export function getCacheableFromTimeline(statuses: MastodonStatus[]): MastodonStatus[] {
  return filterCacheableStatuses(statuses);
}
