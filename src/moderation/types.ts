/**
 * Phase 35 - Moderation types.
 *
 * Defines the domain model for local moderation, safety, and user controls:
 * - Mute/Block entries for individual accounts
 * - Domain-level blocks for entire instances
 * - Content filters for keyword/phrase-based filtering
 * - Safe search levels and moderation decisions
 */

/**
 * A muted account entry.
 * Muted accounts are hidden from timelines/notifications but not fully blocked.
 */
export type MuteEntry = {
  /** The account ID (Mastodon account ID). */
  accountId: string;
  /** Optional display name/acct for UI display. */
  acct?: string;
  /** When the mute was created (ISO string). */
  createdAt: string;
  /** Optional expiry (ISO string). Null means permanent. */
  expiresAt: string | null;
  /** Whether to also suppress notifications from this account. */
  hideNotifications: boolean;
};

/**
 * A blocked account entry.
 * Blocked accounts are completely hidden from all surfaces.
 */
export type BlockEntry = {
  /** The account ID (Mastodon account ID). */
  accountId: string;
  /** Optional display name/acct for UI display. */
  acct?: string;
  /** When the block was created (ISO string). */
  createdAt: string;
};

/**
 * A domain/instance-level block.
 * All content from this domain is hidden from all surfaces.
 */
export type DomainBlock = {
  /** The domain name (e.g. "spam.instance.tld"). */
  domain: string;
  /** When the domain block was created (ISO string). */
  createdAt: string;
  /** Optional reason for the block. */
  reason?: string;
};

/**
 * Action to take when a content filter matches.
 */
export type ContentFilterAction = "hide" | "warn" | "blur";

/**
 * A user-defined content filter.
 * Matches keywords or phrases in post content and applies an action.
 */
export type ContentFilter = {
  /** Unique identifier for the filter. */
  id: string;
  /** The keyword or phrase to match. */
  phrase: string;
  /** Whether the match should be whole-word only. */
  wholeWord: boolean;
  /** Action to take when matched. */
  action: ContentFilterAction;
  /** When the filter was created (ISO string). */
  createdAt: string;
  /** Optional expiry (ISO string). Null means permanent. */
  expiresAt: string | null;
};

/**
 * Safe search level controlling sensitive content visibility.
 */
export type SafeSearchLevel = "strict" | "moderate" | "off";

/**
 * The decision returned by the moderation engine for a given piece of content.
 */
export type ModerationDecision = "show" | "hide" | "warn" | "blur";

/**
 * Detailed moderation result with the decision and reason.
 */
export type ModerationResult = {
  /** The final decision for this content. */
  decision: ModerationDecision;
  /** Reason(s) for the decision. */
  reasons: string[];
  /** The matched filter (if a content filter triggered). */
  matchedFilter?: ContentFilter;
};
