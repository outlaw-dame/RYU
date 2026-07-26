/**
 * Moderation policy engine types.
 *
 * Normalizes Mastodon filters, mutes, blocks, relationships, reports, and
 * preferences into one unified RYU policy model.
 */

// ─── Filter Contexts ──────────────────────────────────────────────────────────

/**
 * Mastodon filter context - where the filter should be applied.
 */
export type FilterContext =
  | "home"
  | "notifications"
  | "public"
  | "thread"
  | "account";

/**
 * Filter action - what to do when a keyword matches.
 */
export type PolicyFilterAction = "warn" | "hide" | "blur";

// ─── Policy Filter ────────────────────────────────────────────────────────────

/**
 * A keyword within a policy filter.
 */
export type PolicyKeyword = {
  id: string;
  keyword: string;
  wholeWord: boolean;
};

/**
 * Unified policy filter - normalizes Mastodon v2 filters.
 */
export type PolicyFilter = {
  id: string;
  title: string;
  keywords: PolicyKeyword[];
  contexts: FilterContext[];
  action: PolicyFilterAction;
  expiresAt: string | null;
  /** Source of the filter: local (user-created) or remote (Mastodon synced). */
  source: "local" | "remote";
  /** Remote ID from Mastodon API. */
  remoteId?: string;
  /** Instance that sourced this filter. */
  instanceOrigin?: string;
  /** Account that owns this filter. */
  accountId?: string;
  createdAt: string;
  updatedAt: string;
};

// ─── Policy Account Actions ───────────────────────────────────────────────────

/**
 * Account moderation action type.
 */
export type AccountModerationAction = "block" | "mute";

/**
 * A moderated account entry (block or mute).
 */
export type PolicyAccount = {
  id: string;
  accountId: string;
  acct?: string;
  action: AccountModerationAction;
  /** For mutes: whether to suppress notifications. */
  hideNotifications: boolean;
  /** For mutes: when the mute expires. */
  expiresAt: string | null;
  source: "local" | "remote";
  remoteId?: string;
  instanceOrigin?: string;
  /** Owner account ID (the user who created this action). */
  ownerAccountId?: string;
  createdAt: string;
  updatedAt: string;
};

// ─── Policy Domain ────────────────────────────────────────────────────────────

/**
 * Domain moderation severity level.
 */
export type DomainModerationSeverity = "block" | "silence" | "hide_from_discovery";

/**
 * A domain-level moderation entry.
 */
export type PolicyDomain = {
  id: string;
  domain: string;
  severity: DomainModerationSeverity;
  reason?: string;
  source: "local" | "remote";
  remoteId?: string;
  instanceOrigin?: string;
  accountId?: string;
  createdAt: string;
  updatedAt: string;
};

// ─── Relationship ─────────────────────────────────────────────────────────────

/**
 * Cached relationship state between the current user and another account.
 */
export type PolicyRelationship = {
  id: string;
  accountId: string;
  following: boolean;
  followedBy: boolean;
  blocking: boolean;
  blockedBy: boolean;
  muting: boolean;
  mutingNotifications: boolean;
  requested: boolean;
  requestedBy: boolean;
  domainBlocking: boolean;
  endorsed: boolean;
  note?: string;
  /** When muting expires (ISO string or null for permanent). */
  mutingExpiresAt: string | null;
  instanceOrigin: string;
  ownerAccountId: string;
  syncedAt: string;
  updatedAt: string;
};

// ─── Report ───────────────────────────────────────────────────────────────────

/**
 * Report category as defined by Mastodon.
 */
export type ReportCategory = "spam" | "violation" | "legal" | "other";

/**
 * Report status.
 */
export type ReportStatus = "draft" | "submitted" | "resolved" | "failed";

/**
 * A report against an account.
 */
export type PolicyReport = {
  id: string;
  /** The reported account ID. */
  targetAccountId: string;
  /** Status IDs attached to the report. */
  statusIds: string[];
  /** User-provided comment. */
  comment: string;
  /** Report category. */
  category: ReportCategory;
  /** Rule IDs that were violated. */
  ruleIds: string[];
  /** Whether to forward to the remote instance admin. */
  forward: boolean;
  /** Current report status. */
  status: ReportStatus;
  /** Remote report ID if submitted. */
  remoteId?: string;
  instanceOrigin?: string;
  accountId?: string;
  createdAt: string;
  updatedAt: string;
};

// ─── Sync State ───────────────────────────────────────────────────────────────

/**
 * Sync state for moderation data.
 */
export type ModerationSyncState = {
  id: string;
  /** What type of data this sync state tracks. */
  dataType: "filters" | "accounts" | "domains" | "relationships" | "reports";
  /** Instance this sync state belongs to. */
  instanceOrigin: string;
  /** Account ID of the authenticated user. */
  accountId: string;
  /** Last successful sync timestamp. */
  syncedAt: string;
  /** Next sync scheduled (for exponential backoff on failures). */
  nextSyncAt?: string;
  /** Number of consecutive failures. */
  failureCount: number;
  updatedAt: string;
};

// ─── Book-Specific Safety Labels ──────────────────────────────────────────────

/**
 * RYU-native safety label categories for book content.
 */
export type BookSafetyLabel =
  | "spoiler"
  | "explicit_sexual"
  | "graphic_violence"
  | "abuse_harassment"
  | "hate"
  | "spam_scam"
  | "ai_generated_slop"
  | "review_bombing"
  | "unsafe_links";

/**
 * Severity level for a safety label.
 */
export type LabelSeverity = "inform" | "warn" | "hide";

/**
 * A safety label applied to content.
 */
export type SafetyLabel = {
  label: BookSafetyLabel;
  severity: LabelSeverity;
  /** Confidence score (0-1). */
  confidence: number;
  /** Source of the label (user report, automatic detection, etc.). */
  source: "user" | "automatic" | "moderator";
  /** Optional note about why the label was applied. */
  note?: string;
};

// ─── Notification Moderation ──────────────────────────────────────────────────

/**
 * Notification trust level classification.
 */
export type NotificationTrustLevel = "trusted" | "normal" | "suspicious" | "blocked";

/**
 * Notification category for moderation purposes.
 */
export type NotificationModerationCategory =
  | "new_account"
  | "private_mention"
  | "mass_mention"
  | "suspicious_link"
  | "known_spammer";

// ─── Evaluation Types ─────────────────────────────────────────────────────────

/**
 * The surface/context for policy evaluation.
 */
export type PolicyEvaluationContext = {
  surface: FilterContext | "search" | "discovery" | "booktok" | "now_reading";
  /** Account ID of the current viewer. */
  viewerAccountId?: string;
  /** Instance origin of the current viewer. */
  viewerInstanceOrigin?: string;
};

/**
 * Result of policy evaluation for a piece of content.
 */
export type PolicyDecision = {
  action: "show" | "hide" | "warn" | "blur" | "collapse";
  reasons: string[];
  matchedFilters: PolicyFilter[];
  safetyLabels: SafetyLabel[];
  /** If action is collapse, display this summary. */
  collapseSummary?: string;
};
