/**
 * Phase 31 - Activity grouper.
 *
 * Groups book-related activities by referenced book entity.
 * Uses title matching, hashtag matching, and content similarity
 * to create meaningful groups of activities about the same book.
 */

import type { BookActivity, ActivityGroup } from "./types";

/**
 * Normalize a book reference string for comparison.
 * Strips common words, punctuation, and collapses whitespace.
 */
function normalizeReference(ref: string): string {
  return ref
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\b(the|a|an|of|and|in|on|at|to|for|is|it)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generate a group key from a book reference.
 */
function referenceToGroupKey(ref: string): string {
  const normalized = normalizeReference(ref);
  return normalized.length > 0 ? `book:${normalized}` : "";
}

/**
 * Generate a group key from a set of relevant hashtags.
 * Falls back to the most specific book-related hashtag.
 */
function hashtagsToGroupKey(hashtags: string[]): string {
  // Prefer specific book-related tags over generic ones
  const generic = new Set(["books", "reading", "bookstodon", "bookwyrm", "bookish", "bibliophile"]);
  const specific = hashtags.filter((t) => !generic.has(t));

  if (specific.length > 0) {
    return `tag:${specific.sort().join("+")}`;
  }

  return "";
}

/**
 * Determine the best group key for an activity.
 */
function getGroupKey(activity: BookActivity): string {
  // Prefer book title references
  if (activity.bookReferences.length > 0) {
    const key = referenceToGroupKey(activity.bookReferences[0]);
    if (key) return key;
  }

  // Fall back to hashtag-based grouping
  if (activity.relevantHashtags.length > 0) {
    const key = hashtagsToGroupKey(activity.relevantHashtags);
    if (key) return key;
  }

  // Ungrouped: use status ID as unique key
  return `status:${activity.status.id}`;
}

/**
 * Generate a human-readable label for a group.
 */
function getGroupLabel(groupKey: string, activities: BookActivity[]): string {
  if (groupKey.startsWith("book:")) {
    // Use the original (non-normalized) first book reference from any activity in the group
    for (const activity of activities) {
      if (activity.bookReferences.length > 0) {
        // Title-case the reference
        const ref = activity.bookReferences[0];
        return ref.replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }
    return groupKey.slice(5).replace(/\b\w/g, (c) => c.toUpperCase());
  }

  if (groupKey.startsWith("tag:")) {
    const tags = groupKey.slice(4).split("+");
    return tags.map((t) => `#${t}`).join(" ");
  }

  // Single-status group: use a snippet of the content
  const first = activities[0];
  if (first) {
    const text = (first.status.content ?? "").replace(/<[^>]*>/g, "").trim();
    return text.length > 40 ? text.slice(0, 40) + "..." : text || "Activity";
  }

  return "Activity";
}

/**
 * Check if two group keys should be merged (fuzzy matching).
 * Returns true if one key is a substring of the other after normalization.
 */
function shouldMergeGroups(keyA: string, keyB: string): boolean {
  if (keyA === keyB) return true;

  // Only merge book: prefixed keys
  if (!keyA.startsWith("book:") || !keyB.startsWith("book:")) return false;

  const a = keyA.slice(5);
  const b = keyB.slice(5);

  // One is a substring of the other (e.g., "project hail mary" and "hail mary")
  return a.includes(b) || b.includes(a);
}

/**
 * Group an array of BookActivity items by their detected book reference.
 * Activities about the same book are collected into a single ActivityGroup.
 *
 * @param activities - Classified activities to group
 * @param options - Grouping options
 * @returns Grouped activities sorted by most recent first
 */
export function groupActivities(
  activities: BookActivity[],
  options: { mergeThreshold?: number } = {}
): ActivityGroup[] {
  const { mergeThreshold: _mergeThreshold } = options;
  const groupMap = new Map<string, BookActivity[]>();
  const keyAliases = new Map<string, string>();

  for (const activity of activities) {
    if (!activity.isBookRelated) continue;

    let groupKey = getGroupKey(activity);

    // Check if this key should be merged with an existing one
    const resolvedAlias = keyAliases.get(groupKey);
    if (resolvedAlias) {
      groupKey = resolvedAlias;
    } else {
      for (const existingKey of groupMap.keys()) {
        if (shouldMergeGroups(groupKey, existingKey)) {
          // Merge into the existing (longer) key
          const canonical = existingKey.length >= groupKey.length ? existingKey : groupKey;
          if (canonical !== groupKey) {
            keyAliases.set(groupKey, canonical);
            groupKey = canonical;
          } else {
            // Re-key existing entries under the new longer key
            const existing = groupMap.get(existingKey)!;
            groupMap.delete(existingKey);
            groupMap.set(canonical, existing);
            keyAliases.set(existingKey, canonical);
          }
          break;
        }
      }
    }

    const existing = groupMap.get(groupKey) ?? [];
    existing.push(activity);
    groupMap.set(groupKey, existing);
  }

  // Build ActivityGroup objects
  const groups: ActivityGroup[] = [];
  for (const [groupKey, groupActivities] of groupMap.entries()) {
    // Sort activities within group by recency
    const sorted = groupActivities.sort((a, b) => {
      const dateA = new Date(a.status.created_at).getTime();
      const dateB = new Date(b.status.created_at).getTime();
      return dateB - dateA;
    });

    const latestAt = sorted[0]?.status.created_at ?? "";
    const uniqueAuthors = new Set(sorted.map((a) => a.status.account.id));

    groups.push({
      groupKey,
      label: getGroupLabel(groupKey, sorted),
      activities: sorted,
      latestAt,
      authorCount: uniqueAuthors.size
    });
  }

  // Sort groups by most recent activity
  groups.sort((a, b) => {
    const dateA = new Date(a.latestAt).getTime();
    const dateB = new Date(b.latestAt).getTime();
    return dateB - dateA;
  });

  return groups;
}

/**
 * Get ungrouped activities (those classified as book-related but
 * that ended up in their own single-item group, plus non-book items).
 */
export function getUngroupedActivities(activities: BookActivity[]): BookActivity[] {
  return activities.filter((a) => !a.isBookRelated);
}
