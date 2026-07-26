/**
 * User-controlled reviewer trust store.
 *
 * Trust is explicit, reversible, locally persisted, and bounded in its effect
 * on recommendations. Storage is partitioned by the authenticated owner
 * identity so server-local account IDs cannot collide across instances.
 */

export type ReviewerTrustLevel = "trusted" | "neutral" | "low_trust" | "muted" | "blocked";

export interface ReviewerTrustEntry {
  accountId: string;
  acct?: string;
  trustLevel: ReviewerTrustLevel;
  reason?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReviewerTrustScoreContribution = {
  delta: number;
  exclude: boolean;
};

const STORAGE_KEY = "ryu:reviewer-trust";
const TRUST_BOOST_MAX = 0.25;
const TRUST_BOOST_MIN = 0.15;
const LOW_TRUST_PENALTY_MAX = -0.15;
const LOW_TRUST_PENALTY_MIN = -0.10;
const MAX_OWNER_ID_LENGTH = 512;

function storageKey(ownerAccountId?: string): string {
  const owner = ownerAccountId?.trim();
  if (!owner || owner.length > MAX_OWNER_ID_LENGTH) return STORAGE_KEY;
  return `${STORAGE_KEY}:${encodeURIComponent(owner)}`;
}

export function loadReviewerTrust(ownerAccountId?: string): ReviewerTrustEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(ownerAccountId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

function saveReviewerTrust(entries: ReviewerTrustEntry[], ownerAccountId?: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(ownerAccountId), JSON.stringify(entries));
  } catch {
    // Storage failure is non-fatal; the caller retains its in-memory state.
  }
}

export function setReviewerTrust(
  accountId: string,
  trustLevel: ReviewerTrustLevel,
  options: { acct?: string; reason?: string; ownerAccountId?: string } = {}
): ReviewerTrustEntry[] {
  const normalizedAccountId = accountId.trim();
  if (!normalizedAccountId || normalizedAccountId.length > 512) {
    return loadReviewerTrust(options.ownerAccountId);
  }

  const entries = loadReviewerTrust(options.ownerAccountId);
  const now = new Date().toISOString();

  if (trustLevel === "neutral") {
    const filtered = entries.filter((entry) => entry.accountId !== normalizedAccountId);
    saveReviewerTrust(filtered, options.ownerAccountId);
    return filtered;
  }

  const existingIndex = entries.findIndex((entry) => entry.accountId === normalizedAccountId);
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
      accountId: normalizedAccountId,
      acct: options.acct,
      trustLevel,
      reason: options.reason,
      createdAt: now,
      updatedAt: now
    });
  }

  saveReviewerTrust(entries, options.ownerAccountId);
  return entries;
}

export function removeReviewerTrust(accountId: string, ownerAccountId?: string): ReviewerTrustEntry[] {
  const normalizedAccountId = accountId.trim();
  const entries = loadReviewerTrust(ownerAccountId)
    .filter((entry) => entry.accountId !== normalizedAccountId);
  saveReviewerTrust(entries, ownerAccountId);
  return entries;
}

export function getReviewerTrustLevel(accountId: string, ownerAccountId?: string): ReviewerTrustLevel {
  return getReviewerTrustEntry(accountId, ownerAccountId)?.trustLevel ?? "neutral";
}

export function getReviewerTrustEntry(
  accountId: string,
  ownerAccountId?: string
): ReviewerTrustEntry | undefined {
  const normalizedAccountId = accountId.trim();
  return loadReviewerTrust(ownerAccountId)
    .find((entry) => entry.accountId === normalizedAccountId);
}

export function resetAllReviewerTrust(ownerAccountId?: string): ReviewerTrustEntry[] {
  saveReviewerTrust([], ownerAccountId);
  return [];
}

export function computeReviewerTrustContribution(
  accountId: string,
  confidence: number = 1.0,
  ownerAccountId?: string
): ReviewerTrustScoreContribution {
  const level = getReviewerTrustLevel(accountId, ownerAccountId);
  const finiteConfidence = Number.isFinite(confidence) ? confidence : 0;
  const clampedConfidence = Math.max(0, Math.min(1, finiteConfidence));

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
    case "blocked":
      return { delta: 0, exclude: true };
    case "neutral":
    default:
      return { delta: 0, exclude: false };
  }
}

export function isReviewerExcluded(accountId: string, ownerAccountId?: string): boolean {
  const level = getReviewerTrustLevel(accountId, ownerAccountId);
  return level === "muted" || level === "blocked";
}

export function getReviewersByTrust(
  trustLevel: ReviewerTrustLevel,
  ownerAccountId?: string
): ReviewerTrustEntry[] {
  return loadReviewerTrust(ownerAccountId)
    .filter((entry) => entry.trustLevel === trustLevel);
}

const VALID_TRUST_LEVELS: Set<string> = new Set([
  "trusted",
  "neutral",
  "low_trust",
  "muted",
  "blocked"
]);

function isValidEntry(entry: unknown): entry is ReviewerTrustEntry {
  if (!entry || typeof entry !== "object") return false;
  const candidate = entry as Record<string, unknown>;
  return (
    typeof candidate.accountId === "string" &&
    candidate.accountId.length > 0 &&
    candidate.accountId.length <= 512 &&
    typeof candidate.trustLevel === "string" &&
    VALID_TRUST_LEVELS.has(candidate.trustLevel) &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string"
  );
}
