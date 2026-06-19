/**
 * Notification moderation - filters suspicious/new/private-mention
 * notifications before they hit the main notification UI.
 *
 * Categories:
 * - new_account: Account was created very recently
 * - private_mention: Direct/private mentions from non-followed accounts
 * - mass_mention: Notifications from mass-mention campaigns
 * - suspicious_link: Contains URLs that look phishy
 * - known_spammer: Account matches known spam patterns
 */

import type {
  NotificationTrustLevel,
  NotificationModerationCategory,
  PolicyAccount,
  PolicyRelationship
} from "./policy-types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationInput = {
  /** The notification type (follow, mention, favourite, reblog, etc.). */
  type: string;
  /** The account ID that triggered the notification. */
  accountId: string;
  /** The account acct string. */
  acct?: string;
  /** When the notifying account was created (ISO string). */
  accountCreatedAt?: string;
  /** Whether the viewer follows this account. */
  isFollowing?: boolean;
  /** The notification content (for DM/mention analysis). */
  content?: string;
  /** The visibility of the related status. */
  visibility?: string;
  /** Number of mentions in the related status. */
  mentionCount?: number;
};

export type NotificationModerationResult = {
  trustLevel: NotificationTrustLevel;
  categories: NotificationModerationCategory[];
  /** Whether this notification should be shown in the main feed. */
  showInMainFeed: boolean;
  /** Whether this notification should be quarantined to a separate pile. */
  quarantine: boolean;
  reasons: string[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

/** Accounts younger than this (in ms) are considered "new". */
const NEW_ACCOUNT_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Mass-mention threshold. */
const MASS_MENTION_THRESHOLD = 10;

/** Suspicious link patterns (common phishing indicators). */
const SUSPICIOUS_LINK_PATTERNS = [
  /bit\.ly\//i,
  /tinyurl\.com\//i,
  /free.*crypto/i,
  /claim.*reward/i,
  /verify.*account/i,
  /urgent.*action/i,
  /click.*here.*immediately/i
];

// ─── Evaluation ───────────────────────────────────────────────────────────────

/**
 * Evaluate a notification for moderation.
 */
export function evaluateNotification(
  input: NotificationInput,
  blockedAccounts: PolicyAccount[],
  relationships: PolicyRelationship[]
): NotificationModerationResult {
  const categories: NotificationModerationCategory[] = [];
  const reasons: string[] = [];

  // Check if account is explicitly blocked
  const isBlocked = blockedAccounts.some(
    (a) => a.accountId === input.accountId && a.action === "block"
  );
  if (isBlocked) {
    return {
      trustLevel: "blocked",
      categories: ["known_spammer"],
      showInMainFeed: false,
      quarantine: false,
      reasons: ["Account is blocked"]
    };
  }

  // Check relationship
  const rel = relationships.find((r) => r.accountId === input.accountId);
  const isFollowing = input.isFollowing ?? rel?.following ?? false;
  const isFollowedBy = rel?.followedBy ?? false;

  // If we are blocking or muting this account, hide the notification
  if (rel?.blocking) {
    return {
      trustLevel: "blocked",
      categories: [],
      showInMainFeed: false,
      quarantine: false,
      reasons: ["Account is blocked (via relationship)"]
    };
  }

  if (rel?.muting && rel?.mutingNotifications !== false) {
    return {
      trustLevel: "blocked",
      categories: [],
      showInMainFeed: false,
      quarantine: false,
      reasons: ["Account is muted with notification suppression (via relationship)"]
    };
  }

  // Trusted: mutual follows or accounts we explicitly follow
  if (isFollowing) {
    return {
      trustLevel: "trusted",
      categories: [],
      showInMainFeed: true,
      quarantine: false,
      reasons: []
    };
  }

  // New account check
  if (input.accountCreatedAt) {
    const accountAge = Date.now() - Date.parse(input.accountCreatedAt);
    if (accountAge < NEW_ACCOUNT_THRESHOLD_MS) {
      categories.push("new_account");
      reasons.push("Account is less than 7 days old");
    }
  }

  // Private mention from non-followed account
  if (input.type === "mention" && input.visibility === "direct" && !isFollowedBy) {
    categories.push("private_mention");
    reasons.push("Private mention from non-followed account");
  }

  // Mass mention detection
  if (input.mentionCount != null && input.mentionCount >= MASS_MENTION_THRESHOLD) {
    categories.push("mass_mention");
    reasons.push(`Status mentions ${input.mentionCount} accounts`);
  }

  // Suspicious link check
  if (input.content) {
    const hasSuspiciousLink = SUSPICIOUS_LINK_PATTERNS.some((pattern) =>
      pattern.test(input.content!)
    );
    if (hasSuspiciousLink) {
      categories.push("suspicious_link");
      reasons.push("Contains suspicious link patterns");
    }
  }

  // Determine trust level and quarantine status
  if (categories.length === 0) {
    return {
      trustLevel: isFollowedBy ? "trusted" : "normal",
      categories: [],
      showInMainFeed: true,
      quarantine: false,
      reasons: []
    };
  }

  // Multiple red flags = suspicious
  const isSuspicious = categories.length >= 2 ||
    categories.includes("mass_mention") ||
    categories.includes("suspicious_link");

  return {
    trustLevel: isSuspicious ? "suspicious" : "normal",
    categories,
    showInMainFeed: !isSuspicious,
    quarantine: isSuspicious,
    reasons
  };
}

/**
 * Filter a list of notifications, separating main feed from quarantine.
 */
export function filterNotifications<T extends { accountId: string; type: string }>(
  notifications: T[],
  evaluator: (n: T) => NotificationModerationResult
): { main: T[]; quarantine: T[] } {
  const main: T[] = [];
  const quarantine: T[] = [];

  for (const notification of notifications) {
    const result = evaluator(notification);
    if (result.showInMainFeed) {
      main.push(notification);
    } else if (result.quarantine) {
      quarantine.push(notification);
    }
    // If neither showInMainFeed nor quarantine, it is completely hidden (blocked)
  }

  return { main, quarantine };
}
