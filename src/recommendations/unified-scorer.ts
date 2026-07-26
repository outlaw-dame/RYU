/**
 * Unified scoring pipeline for recommendations.
 *
 * Applies signal boosts/penalties, reviewer trust, and suppression checks
 * to produce a fully-traced scored recommendation. The trace enables the
 * "Why am I seeing this?" UI and aids debugging.
 */

import type { Recommendation } from "../discovery/types";
import type { SignalEntityType } from "./signal-types";
import { getEffectiveSignal, isEntitySuppressed } from "./signal-store";
import { computeReviewerTrustContribution, isReviewerExcluded } from "./reviewer-trust-store";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScoreContribution {
  kind: "base" | "signal_boost" | "signal_penalty" | "reviewer_trust" | "suppression";
  delta: number;
  label: string;
  signalId?: string;
}

export interface ScoredRecommendation extends Recommendation {
  scoreTrace: {
    baseScore: number;
    finalScore: number;
    contributions: ScoreContribution[];
    excluded: boolean;
    excludeReason?: string;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SHOW_MORE_MULTIPLIER = 0.2;
const SHOW_LESS_MULTIPLIER = 0.15;
const PREFER_MULTIPLIER = 0.25;

// ─── Core Scoring ─────────────────────────────────────────────────────────────

/**
 * Score a single recommendation by applying signals, trust, and suppression.
 *
 * Steps:
 * 1. Start with rec.score as baseScore
 * 2. Check entity suppression → excluded
 * 3. Check reviewer exclusion → excluded
 * 4. Apply show_more boost (+strength * 0.2)
 * 5. Apply show_less penalty (-strength * 0.15)
 * 6. Apply prefer boost (+strength * 0.25)
 * 7. Apply reviewer trust contribution
 * 8. Clamp finalScore to [0, 1]
 */
export function scoreRecommendation(
  rec: Recommendation,
  reviewerAccountId?: string
): ScoredRecommendation {
  const baseScore = rec.score;
  const contributions: ScoreContribution[] = [];
  let excluded = false;
  let excludeReason: string | undefined;
  let runningScore = baseScore;

  contributions.push({
    kind: "base",
    delta: baseScore,
    label: "Base recommendation score"
  });

  // 1. Check entity suppression
  const entityType = rec.entityType as SignalEntityType;
  if (isEntitySuppressed(entityType, rec.id)) {
    excluded = true;
    excludeReason = `Entity suppressed: ${entityType}/${rec.id}`;
    contributions.push({
      kind: "suppression",
      delta: 0,
      label: "Entity is suppressed"
    });
  }

  // 2. Check reviewer exclusion
  if (reviewerAccountId && isReviewerExcluded(reviewerAccountId)) {
    excluded = true;
    excludeReason = excludeReason ?? `Reviewer excluded: ${reviewerAccountId}`;
    contributions.push({
      kind: "suppression",
      delta: 0,
      label: "Reviewer is excluded"
    });
  }

  // 3. show_more signal → boost
  const showMore = getEffectiveSignal(entityType, rec.id, "show_more");
  if (showMore) {
    const delta = showMore.strength * SHOW_MORE_MULTIPLIER;
    runningScore += delta;
    contributions.push({
      kind: "signal_boost",
      delta,
      label: "Show more like this",
      signalId: showMore.id
    });
  }

  // 4. show_less signal → penalty
  const showLess = getEffectiveSignal(entityType, rec.id, "show_less");
  if (showLess) {
    const delta = -(showLess.strength * SHOW_LESS_MULTIPLIER);
    runningScore += delta;
    contributions.push({
      kind: "signal_penalty",
      delta,
      label: "Show less like this",
      signalId: showLess.id
    });
  }

  // 5. prefer signal → boost
  const prefer = getEffectiveSignal(entityType, rec.id, "prefer");
  if (prefer) {
    const delta = prefer.strength * PREFER_MULTIPLIER;
    runningScore += delta;
    contributions.push({
      kind: "signal_boost",
      delta,
      label: "Preferred entity",
      signalId: prefer.id
    });
  }

  // 6. Reviewer trust contribution
  if (reviewerAccountId) {
    const trustResult = computeReviewerTrustContribution(reviewerAccountId);
    if (trustResult.delta !== 0) {
      runningScore += trustResult.delta;
      contributions.push({
        kind: "reviewer_trust",
        delta: trustResult.delta,
        label: trustResult.delta > 0 ? "Trusted reviewer boost" : "Low-trust reviewer penalty"
      });
    }
  }

  // 7. Clamp to [0, 1]
  const finalScore = Math.max(0, Math.min(1, runningScore));

  return {
    ...rec,
    scoreTrace: {
      baseScore,
      finalScore,
      contributions,
      excluded,
      excludeReason
    }
  };
}

/**
 * Score, filter, and sort a batch of recommendations.
 *
 * @param recs - Raw recommendations from discovery engines
 * @param reviewerAccountIds - Optional map of recommendation ID → reviewer account ID
 * @returns Scored, non-excluded recommendations sorted by finalScore descending
 */
export function scoreAndFilterRecommendations(
  recs: Recommendation[],
  reviewerAccountIds?: Map<string, string>
): ScoredRecommendation[] {
  const scored = recs.map((rec) => {
    const reviewerAccountId = reviewerAccountIds?.get(rec.id);
    return scoreRecommendation(rec, reviewerAccountId);
  });

  return scored
    .filter((sr) => !sr.scoreTrace.excluded)
    .sort((a, b) => b.scoreTrace.finalScore - a.scoreTrace.finalScore);
}
