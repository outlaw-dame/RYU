/**
 * Recommendation and trust controls.
 *
 * User-controlled "show less like this", author/work/entity suppression,
 * spoiler auto-hide preferences, review-bomb detection, spam scoring,
 * and per-community moderation presets.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Suppression target types for "show less like this".
 */
export type SuppressionType = "author" | "work" | "entity" | "topic";

/**
 * A user suppression entry.
 */
export type SuppressionEntry = {
  id: string;
  type: SuppressionType;
  /** The suppressed identifier (author name, work title, entity ID, topic). */
  target: string;
  /** Optional reason for suppression. */
  reason?: string;
  createdAt: string;
};

/**
 * Community moderation preset level.
 */
export type ModerationPreset = "strict" | "moderate" | "permissive";

/**
 * Trust score components for an account.
 */
export type TrustScore = {
  /** Overall trust score (0-1). Higher = more trusted. */
  overall: number;
  /** Account age factor (0-1). */
  accountAge: number;
  /** Activity consistency factor (0-1). */
  activityConsistency: number;
  /** Community standing factor (0-1). */
  communityStanding: number;
  /** Spam score (0-1). Higher = more likely spam. */
  spamScore: number;
};

/**
 * Review-bomb detection input.
 */
export type ReviewBombInput = {
  /** The work/book being reviewed. */
  workId: string;
  /** All reviews within the detection window. */
  reviews: ReviewEntry[];
  /** Detection window in milliseconds. Default: 24 hours. */
  windowMs?: number;
  /** Minimum reviews to trigger detection. Default: 5. */
  minReviewCount?: number;
  /** Maximum ratio of low ratings to trigger. Default: 0.8. */
  lowRatingRatio?: number;
};

export type ReviewEntry = {
  accountId: string;
  rating: number;
  /** Account creation date (ISO string). */
  accountCreatedAt: string;
  /** Review creation date (ISO string). */
  createdAt: string;
  /** Content of the review (for spam scoring). */
  content?: string;
};

export type ReviewBombResult = {
  /** Whether review-bombing was detected. */
  detected: boolean;
  /** Confidence score (0-1). */
  confidence: number;
  /** Number of suspicious reviews. */
  suspiciousCount: number;
  /** Total reviews in window. */
  totalInWindow: number;
  /** Reason for detection (or reason it was not detected). */
  reason: string;
};

/**
 * Spam score input.
 */
export type SpamScoreInput = {
  content: string;
  /** Account age in days. */
  accountAgeDays: number;
  /** Number of links in content. */
  linkCount?: number;
  /** Total content length. */
  contentLength?: number;
  /** Whether the account is verified/established. */
  isEstablished?: boolean;
};

export type SpamScoreResult = {
  /** Overall spam probability (0-1). */
  score: number;
  /** Individual signal contributions. */
  signals: {
    linkDensity: number;
    repetitiveContent: number;
    newAccountPenalty: number;
    shortContent: number;
  };
  /** Whether the content should be flagged. */
  flagged: boolean;
};

/**
 * Per-community moderation settings.
 */
export type CommunityModerationSettings = {
  preset: ModerationPreset;
  /** Custom overrides on top of the preset. */
  overrides: {
    /** Custom spam threshold (overrides preset default). */
    spamThreshold?: number;
    /** Custom new-account age threshold in days. */
    newAccountDays?: number;
    /** Whether review-bomb detection is enabled. */
    reviewBombDetection?: boolean;
    /** Whether semantic filtering is enabled. */
    semanticFiltering?: boolean;
  };
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPRESSIONS_KEY = "ryu:trust-suppressions";
const COMMUNITY_SETTINGS_KEY = "ryu:community-moderation";

/** Default detection window: 24 hours. */
const DEFAULT_REVIEW_BOMB_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Default minimum review count to trigger detection. */
const DEFAULT_MIN_REVIEW_COUNT = 5;

/** Default low-rating ratio threshold. */
const DEFAULT_LOW_RATING_RATIO = 0.8;

/** Rating considered "low" for review-bomb detection. */
const LOW_RATING_THRESHOLD = 2;

/** Account age considered "new" for review-bomb heuristics (days). */
const NEW_ACCOUNT_DAYS = 30;

/** Spam score threshold for flagging. */
const DEFAULT_SPAM_THRESHOLD = 0.6;

/** Preset configurations. */
const PRESET_CONFIGS: Record<ModerationPreset, CommunityModerationSettings> = {
  strict: {
    preset: "strict",
    overrides: {
      spamThreshold: 0.4,
      newAccountDays: 60,
      reviewBombDetection: true,
      semanticFiltering: true
    }
  },
  moderate: {
    preset: "moderate",
    overrides: {
      spamThreshold: 0.6,
      newAccountDays: 30,
      reviewBombDetection: true,
      semanticFiltering: true
    }
  },
  permissive: {
    preset: "permissive",
    overrides: {
      spamThreshold: 0.8,
      newAccountDays: 7,
      reviewBombDetection: false,
      semanticFiltering: false
    }
  }
};

// ─── Suppression Store ────────────────────────────────────────────────────────

let idCounter = 0;

function generateId(): string {
  idCounter += 1;
  return `sup-${Date.now()}-${idCounter}`;
}

/**
 * Load suppression entries from localStorage.
 */
export function loadSuppressions(): SuppressionEntry[] {
  try {
    const raw = localStorage.getItem(SUPPRESSIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Save suppression entries to localStorage.
 */
export function saveSuppressions(entries: SuppressionEntry[]): void {
  try {
    localStorage.setItem(SUPPRESSIONS_KEY, JSON.stringify(entries));
  } catch {
    // Storage unavailable
  }
}

/**
 * Add a suppression ("show less like this").
 */
export function addSuppression(
  type: SuppressionType,
  target: string,
  reason?: string
): SuppressionEntry[] {
  const entries = loadSuppressions();

  // Do not duplicate
  if (entries.some((e) => e.type === type && e.target.toLowerCase() === target.toLowerCase())) {
    return entries;
  }

  const entry: SuppressionEntry = {
    id: generateId(),
    type,
    target: target.trim(),
    reason,
    createdAt: new Date().toISOString()
  };

  entries.push(entry);
  saveSuppressions(entries);
  return entries;
}

/**
 * Remove a suppression by ID.
 */
export function removeSuppression(id: string): SuppressionEntry[] {
  const entries = loadSuppressions().filter((e) => e.id !== id);
  saveSuppressions(entries);
  return entries;
}

/**
 * Check if a target is suppressed.
 */
export function isSuppressed(type: SuppressionType, target: string): boolean {
  const entries = loadSuppressions();
  const normalizedTarget = target.trim().toLowerCase();
  return entries.some(
    (e) => e.type === type && e.target.toLowerCase() === normalizedTarget
  );
}

// ─── Trust Scoring ────────────────────────────────────────────────────────────

/**
 * Compute a trust score for an account based on available signals.
 */
export function computeTrustScore(params: {
  accountAgeDays: number;
  postCount?: number;
  followerCount?: number;
  followingCount?: number;
  isVerified?: boolean;
  previousViolations?: number;
}): TrustScore {
  const {
    accountAgeDays,
    postCount = 0,
    followerCount = 0,
    followingCount = 0,
    isVerified = false,
    previousViolations = 0
  } = params;

  // Account age factor: ramps up over first 90 days
  const accountAge = Math.min(1, accountAgeDays / 90);

  // Activity consistency: based on posts relative to account age
  const expectedPosts = Math.max(1, accountAgeDays * 0.5);
  const activityConsistency = Math.min(1, postCount / expectedPosts);

  // Community standing: follower/following ratio with verification bonus
  const followerRatio = followingCount > 0
    ? Math.min(1, followerCount / followingCount)
    : followerCount > 0 ? 1 : 0;
  const verificationBonus = isVerified ? 0.2 : 0;
  const violationPenalty = Math.min(1, previousViolations * 0.25);
  const communityStanding = Math.min(1, Math.max(0, followerRatio + verificationBonus - violationPenalty));

  // Spam score: inverse of trust signals
  const spamScore = Math.max(0, Math.min(1,
    1 - (accountAge * 0.4 + activityConsistency * 0.3 + communityStanding * 0.3)
  ));

  // Overall trust: weighted average
  const overall = Math.max(0, Math.min(1,
    accountAge * 0.3 + activityConsistency * 0.3 + communityStanding * 0.4
  ));

  return { overall, accountAge, activityConsistency, communityStanding, spamScore };
}

// ─── Review-Bomb Detection ────────────────────────────────────────────────────

/**
 * Detect potential review-bombing for a work.
 *
 * Signals:
 * - Many low ratings in a short window
 * - High proportion of ratings from new accounts
 * - Repetitive content across reviews
 */
export function detectReviewBomb(input: ReviewBombInput): ReviewBombResult {
  const windowMs = input.windowMs ?? DEFAULT_REVIEW_BOMB_WINDOW_MS;
  const minCount = input.minReviewCount ?? DEFAULT_MIN_REVIEW_COUNT;
  const lowRatioThreshold = input.lowRatingRatio ?? DEFAULT_LOW_RATING_RATIO;

  const now = Date.now();
  const windowStart = now - windowMs;

  // Filter reviews within the window
  const recentReviews = input.reviews.filter(
    (r) => Date.parse(r.createdAt) >= windowStart
  );

  if (recentReviews.length < minCount) {
    return {
      detected: false,
      confidence: 0,
      suspiciousCount: 0,
      totalInWindow: recentReviews.length,
      reason: `Insufficient reviews in window (${recentReviews.length}/${minCount})`
    };
  }

  // Count low ratings
  const lowRatingReviews = recentReviews.filter((r) => r.rating <= LOW_RATING_THRESHOLD);
  const lowRatio = lowRatingReviews.length / recentReviews.length;

  // Count reviews from new accounts
  const newAccountReviews = recentReviews.filter((r) => {
    const ageDays = (now - Date.parse(r.accountCreatedAt)) / (1000 * 60 * 60 * 24);
    return ageDays < NEW_ACCOUNT_DAYS;
  });
  const newAccountRatio = newAccountReviews.length / recentReviews.length;

  // Compute confidence based on signals
  let confidence = 0;

  // Low rating ratio signal
  if (lowRatio >= lowRatioThreshold) {
    confidence += 0.4;
  } else if (lowRatio >= lowRatioThreshold * 0.75) {
    confidence += 0.2;
  }

  // New account ratio signal
  if (newAccountRatio > 0.6) {
    confidence += 0.35;
  } else if (newAccountRatio > 0.3) {
    confidence += 0.15;
  }

  // Volume signal: more reviews = higher confidence
  const volumeSignal = Math.min(0.25, (recentReviews.length - minCount) * 0.05);
  confidence += volumeSignal;

  confidence = Math.min(1, confidence);

  const suspiciousCount = lowRatingReviews.filter((r) => {
    const ageDays = (now - Date.parse(r.accountCreatedAt)) / (1000 * 60 * 60 * 24);
    return ageDays < NEW_ACCOUNT_DAYS;
  }).length;

  const detected = confidence >= 0.5;

  return {
    detected,
    confidence,
    suspiciousCount,
    totalInWindow: recentReviews.length,
    reason: detected
      ? `Review-bomb detected: ${lowRatingReviews.length}/${recentReviews.length} low ratings, ${newAccountReviews.length} from new accounts`
      : `No review-bomb detected (confidence ${(confidence * 100).toFixed(0)}%)`
  };
}

// ─── Spam Scoring ─────────────────────────────────────────────────────────────

/**
 * Compute a spam score for content.
 *
 * Signals:
 * - Link density (high number of links relative to content length)
 * - Repetitive content (duplicate words/phrases)
 * - New account penalty
 * - Suspiciously short content
 */
export function computeSpamScore(input: SpamScoreInput): SpamScoreResult {
  const {
    content,
    accountAgeDays,
    linkCount: providedLinkCount,
    contentLength: providedLength,
    isEstablished = false
  } = input;

  const contentLength = providedLength ?? content.length;

  // Link density: count URLs or use provided count
  const linkCount = providedLinkCount ?? countLinks(content);
  const linkDensity = contentLength > 0
    ? Math.min(1, (linkCount * 50) / contentLength)
    : 0;

  // Repetitive content: check for repeated words/phrases
  const repetitiveContent = computeRepetitiveScore(content);

  // New account penalty: accounts < 7 days old get higher penalty
  const newAccountPenalty = isEstablished
    ? 0
    : Math.max(0, Math.min(1, 1 - (accountAgeDays / 30)));

  // Short content signal: very short reviews with links are suspicious
  const shortContent = contentLength < 20 && linkCount > 0 ? 0.8 :
    contentLength < 50 ? 0.3 : 0;

  // Weighted combination
  const score = Math.min(1, Math.max(0,
    linkDensity * 0.35 +
    repetitiveContent * 0.25 +
    newAccountPenalty * 0.25 +
    shortContent * 0.15
  ));

  return {
    score,
    signals: { linkDensity, repetitiveContent, newAccountPenalty, shortContent },
    flagged: score >= DEFAULT_SPAM_THRESHOLD
  };
}

/**
 * Count links (URLs) in content text.
 */
function countLinks(content: string): number {
  const urlPattern = /https?:\/\/[^\s<]+/gi;
  const matches = content.match(urlPattern);
  return matches ? matches.length : 0;
}

/**
 * Compute repetitiveness score based on word frequency.
 */
function computeRepetitiveScore(content: string): number {
  const words = content.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (words.length < 5) return 0;

  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  // Ratio of repeated words to total words
  let repeatedCount = 0;
  for (const count of freq.values()) {
    if (count > 2) {
      repeatedCount += count - 1;
    }
  }

  return Math.min(1, repeatedCount / words.length);
}

// ─── Community Moderation Presets ─────────────────────────────────────────────

/**
 * Get the preset configuration for a given level.
 */
export function getPresetConfig(preset: ModerationPreset): CommunityModerationSettings {
  return { ...PRESET_CONFIGS[preset] };
}

/**
 * Load community moderation settings from localStorage.
 */
export function loadCommunitySettings(): CommunityModerationSettings {
  try {
    const raw = localStorage.getItem(COMMUNITY_SETTINGS_KEY);
    if (!raw) return getPresetConfig("moderate");
    const parsed = JSON.parse(raw);
    if (parsed.preset && PRESET_CONFIGS[parsed.preset as ModerationPreset]) {
      return {
        preset: parsed.preset,
        overrides: { ...PRESET_CONFIGS[parsed.preset as ModerationPreset].overrides, ...parsed.overrides }
      };
    }
    return getPresetConfig("moderate");
  } catch {
    return getPresetConfig("moderate");
  }
}

/**
 * Save community moderation settings to localStorage.
 */
export function saveCommunitySettings(settings: CommunityModerationSettings): void {
  try {
    localStorage.setItem(COMMUNITY_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable
  }
}

/**
 * Get the effective spam threshold based on community settings.
 */
export function getEffectiveSpamThreshold(settings?: CommunityModerationSettings): number {
  const s = settings ?? loadCommunitySettings();
  return s.overrides.spamThreshold ?? DEFAULT_SPAM_THRESHOLD;
}

/**
 * Check if review-bomb detection is enabled for current settings.
 */
export function isReviewBombDetectionEnabled(settings?: CommunityModerationSettings): boolean {
  const s = settings ?? loadCommunitySettings();
  return s.overrides.reviewBombDetection ?? true;
}

/**
 * Check if semantic filtering is enabled for current settings.
 */
export function isSemanticFilteringEnabled(settings?: CommunityModerationSettings): boolean {
  const s = settings ?? loadCommunitySettings();
  return s.overrides.semanticFiltering ?? true;
}
