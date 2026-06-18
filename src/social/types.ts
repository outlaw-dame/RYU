/**
 * Phase 31 - Social activity types.
 *
 * Defines the domain model for book-centered social activity:
 * - BookActivity: a MastodonStatus enriched with book entity references
 * - ActivityGroup: activities grouped by a common book or author
 * - ActivityFilter: filtering controls for the book activity feed
 */

import type { MastodonStatus } from "../sync/mastodon-client";

/**
 * Classification of a social post in terms of book-related activity.
 */
export type BookActivityType =
  | "review"
  | "rating"
  | "reading-update"
  | "recommendation"
  | "discussion"
  | "general";

/**
 * A MastodonStatus enriched with book-relevance classification.
 */
export type BookActivity = {
  /** The original Mastodon status. */
  status: MastodonStatus;
  /** How this status relates to book activity. */
  activityType: BookActivityType;
  /** Whether this status is book-related (non-general). */
  isBookRelated: boolean;
  /** Detected book title references (lowercase, normalized). */
  bookReferences: string[];
  /** Detected hashtags relevant to the classification. */
  relevantHashtags: string[];
  /** Confidence score for the classification (0-1). */
  confidence: number;
};

/**
 * A group of activities related to the same book or topic.
 */
export type ActivityGroup = {
  /** Unique key for the group (derived from book title or hashtag). */
  groupKey: string;
  /** Human-readable label for the group. */
  label: string;
  /** Activities in this group, sorted by recency. */
  activities: BookActivity[];
  /** Most recent activity timestamp in the group. */
  latestAt: string;
  /** Count of distinct authors in this group. */
  authorCount: number;
};

/**
 * Filter options for the book activity feed.
 */
export type ActivityFilter =
  | "all"
  | "books"
  | "reviews"
  | "recommendations"
  | "following";

/**
 * Visibility level for remote content, mapped from Mastodon visibility.
 */
export type RemoteVisibility =
  | "public"
  | "unlisted"
  | "private"
  | "direct";

/**
 * Cache eligibility result from the visibility guard.
 */
export type CacheEligibility = {
  /** Whether this content may be cached locally. */
  cacheable: boolean;
  /** Whether this content may appear in local search results. */
  searchable: boolean;
  /** Reason if content is not cacheable/searchable. */
  reason?: string;
};
