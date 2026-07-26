/**
 * User-controlled reviewer trust store.
 *
 * Allows users to explicitly mark reviewers as trusted, neutral, low-trust,
 * muted, or blocked for recommendation purposes. This is distinct from
 * Mastodon moderation — a reviewer can be trusted for recommendations
 * but not followed, or muted for recommendations but not account-level muted.
 *
 * Key design principles:
 * - Explicit user judgment: system heuristics may SUGGEST but never
 *   automatically assign "trusted" or "low_trust"
 * - Visible and reversible: every trust decision can be inspected and undone
 * - Local-first: persisted in localStorage (with RxDB dual-write ready)
 * - Bounded effect: trust boosts/penalties are capped to prevent any single
 *   reviewer from dominating recommendations
 *
 * Trust levels and their effect on recommendation scoring:
 * - trusted:   +0.15 to +0.25 boost (capped)
 * - neutral:   no effect (default)
 * - low_trust: -0.10 to -0.15 penalty
 * - muted:     reviewer's content excluded from recommendations entirely
 * - blocked:   reviewer's content excluded AND hidden from all surfaces
 */

export type ReviewerTrustLevel = "trusted" | "neutral" | "low_trust" | "muted" | "blocked";

export interface ReviewerTrustEntry {
  /** The reviewer's account ID (Mastodon account ID). */
  accountId: string;
  /** Optional display acct (e.g., "user@instance.tld"). */
  acct?: string;
  /** The trust level assigned by the user. */
  trustLevel: ReviewerTrustLevel;
  /** Why the user set this level (optional user note). */
  reason?: string;
  /** When this trust level was set. */
  createdAt: string;
  /** When this was last modified. */
  updatedAt: string;
}

export type ReviewerTrustScoreContribution = {
  /** Bounded delta applied to recommendation score. */
  delta: number;
  /** Whether this reviewer's content should be excluded entirely. */
  exclude: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "ryu:reviewer-trust";

/** Maximum positive boost from a trusted reviewer. */
const TRUST_BOOST_MAX = 0.25;
/** Minimum positive boost from a trusted reviewer. */
const TRUST_BOOST_MIN = 0.15;
/** Maximum penalty from a low-trust reviewer. */
const LOW_TRUST_PENALTY_MAX = -0.15;
/** Minimum penalty from a low-trust reviewer. */
const LOW_TRUST_PENALTY_MIN = -0.10;

// ─── Persistence ──────────────────────────────────────────────────────────────

/**
 * Load all reviewer trust entries from localStorage.
 */
export function loadReviewerTrust(): ReviewerTrustEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

/**
 * Save all reviewer trust entries to localStorage.
 */
function saveReviewerTrust(entries: ReviewerTrustEntry[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full — non-fatal
  }
}

// ─── CRUD Operations ──────────────────────────────────────────────────────────

/**
 * Set a reviewer's trust level. Creates or updates the entry.
 * Setting to "neutral" removes the entry (neutral is the default).
 */
export function setReviewerTrust(
  accountId: string,
  trustLevel: ReviewerTrustLevel,
  options: { acct?: string; reason?: string } = {}
): ReviewerTrustEntry[] {
  if (!accountId || accountId.length > 512) return loadReviewerTrust();

  const entries = loadReviewerTrust();
  const now = new Date().toISOString();

  // Remove if setting to neutral (it's the implicit default)
  if (trustLevel === "neutral") {
    const filtered = entries.filter((e) => e.accountId !== accountId);
    saveReviewerTrust(filtered);
    return filtered;
  }

  const existingIndex = entries.findIndex((e) => e.accountId === accountId);
  if (existingIndex >= 0) {
    entries[existingIndex] = {
      ...entries[existingIndex],
      trustLevel,
      reason: options.reason ?? entries[existingIndex].reason,
      acct: options.acct ?? entries[existingIndex].acct,
      updatedAt: now
    };
  } else {
    entries.push({
      accountId,
      acct: options.acct,
      trustLevel,
      reason: options.reason,
      createdAt: now,
      updatedAt: now
    });
  }

  saveReviewerTrust(entries);
  return entries;
}

/**
 * Remove a reviewer's trust entry (reverts to neutral).
 */
export function removeReviewerTrust(accountId: string): ReviewerTrustEntry[] {
  const entries = loadReviewerTrust().filter((e) => e.accountId !== accountId);
  saveReviewerTrust(entries);
  return entries;
}

/**
 * Get the trust level for a specific reviewer. Returns "neutral" if not set.
 */
export function getReviewerTrustLevel(accountId: string): ReviewerTrustLevel {
  const entries = loadReviewerTrust();
  const entry = entries.find((e) => e.accountId === accountId);
  return entry?.trustLevel ?? "neutral";
}

/**
 * Get the full trust entry for a reviewer, or undefined if not set.
 */
export function getReviewerTrustEntry(accountId: string): ReviewerTrustEntry | undefined {
  return loadReviewerTrust().find((e) => e.accountId === accountId);
}

/**
 * Reset all reviewer trust (clear everything).
 */
export function resetAllReviewerTrust(): ReviewerTrustEntry[] {
  saveReviewerTrust([]);
  return [];
}

// ─── Scoring Integration ──────────────────────────────────────────────────────

/**
 * Compute the bounded score contribution for a reviewer's trust level.
 *
 * Returns a delta (positive or negative) to apply to recommendation scores
 * that are influenced by this reviewer, plus an exclusion flag.
 *
 * The delta is BOUNDED — no single reviewer can dominate recommendations.
 * The exact value within the range depends on the "confidence" input (0-1)
 * which represents how relevant this reviewer's review is to the recommendation.
 */
export function computeReviewerTrustContribution(
  accountId: string,
  confidence: number = 1.0
): ReviewerTrustScoreContribution {
  const level = getReviewerTrustLevel(accountId);
  const clampedConfidence = Math.max(0, Math.min(1, confidence));

  switch (level) {
    case "trusted":
      return {
        delta: TRUST_BOOST_MIN + (TRUST_BOOST_MAX - TRUST_BOOST_MIN) * clampedConfidence,
        exclude: false
      };
    case "low_trust":
      return {
        delta: LOW_TRUST_PENALTY_MIN + (LOW_TRUST_PENALTY_MAX - LOW_TRUST_PENALTY_MIN) * clampedConfidence,
        exclude: false
      };
    case "muted":
      return { delta: 0, exclude: true };
    case "blocked":
      return { delta: 0, exclude: true };
    case "neutral":
    default:
      return { delta: 0, exclude: false };
  }
}

/**
 * Check if a reviewer is excluded from recommendations (muted or blocked).
 */
export function isReviewerExcluded(accountId: string): boolean {
  const level = getReviewerTrustLevel(accountId);
  return level === "muted" || level === "blocked";
}

/**
 * Get all reviewers at a specific trust level.
 */
export function getReviewersByTrust(trustLevel: ReviewerTrustLevel): ReviewerTrustEntry[] {
  return loadReviewerTrust().filter((e) => e.trustLevel === trustLevel);
}

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_TRUST_LEVELS: Set<string> = new Set(["trusted", "neutral", "low_trust", "muted", "blocked"]);

function isValidEntry(entry: unknown): entry is ReviewerTrustEntry {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  return (
    typeof e.accountId === "string" &&
    e.accountId.length > 0 &&
    typeof e.trustLevel === "string" &&
    VALID_TRUST_LEVELS.has(e.trustLevel) &&
    typeof e.createdAt === "string" &&
    typeof e.updatedAt === "string"
  );
}
