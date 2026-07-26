/** Unified, owner-scoped recommendation scoring pipeline. */

import type { Recommendation } from "../discovery/types";
import type { SignalEntityType } from "./signal-types";
import { getEffectiveSignal, isEntitySuppressed } from "./signal-store";
import { computeReviewerTrustContribution, isReviewerExcluded } from "./reviewer-trust-store";

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

export interface RecommendationScoringContext {
  ownerAccountId: string;
  reviewerAccountId?: string;
}

const SHOW_MORE_MULTIPLIER = 0.2;
const SHOW_LESS_MULTIPLIER = 0.15;
const PREFER_MULTIPLIER = 0.25;

export function scoreRecommendation(
  rec: Recommendation,
  context?: RecommendationScoringContext
): ScoredRecommendation {
  const baseScore = rec.score;
  const contributions: ScoreContribution[] = [{
    kind: "base",
    delta: baseScore,
    label: "Base recommendation score"
  }];
  let excluded = false;
  let excludeReason: string | undefined;
  let runningScore = baseScore;
  const ownerAccountId = context?.ownerAccountId;
  const reviewerAccountId = context?.reviewerAccountId;
  const entityType = rec.entityType as SignalEntityType;

  if (ownerAccountId && isEntitySuppressed(entityType, rec.id, ownerAccountId)) {
    excluded = true;
    excludeReason = `Entity suppressed: ${entityType}/${rec.id}`;
    contributions.push({ kind: "suppression", delta: 0, label: "Entity is suppressed" });
  }

  if (ownerAccountId && rec.authorIds?.some((authorId) =>
    isEntitySuppressed("author", authorId, ownerAccountId)
  )) {
    excluded = true;
    excludeReason = excludeReason ?? "Recommended author is suppressed";
    contributions.push({ kind: "suppression", delta: 0, label: "Author is suppressed" });
  }

  if (ownerAccountId && reviewerAccountId &&
      isReviewerExcluded(reviewerAccountId, ownerAccountId)) {
    excluded = true;
    excludeReason = excludeReason ?? `Reviewer excluded: ${reviewerAccountId}`;
    contributions.push({ kind: "suppression", delta: 0, label: "Reviewer is excluded" });
  }

  if (ownerAccountId) {
    const showMore = getEffectiveSignal(entityType, rec.id, "show_more", ownerAccountId);
    const showLess = getEffectiveSignal(entityType, rec.id, "show_less", ownerAccountId);
    // Defensive conflict resolution for legacy/imported data. Prefer the most
    // recently updated explicit intent instead of applying opposing deltas.
    const preference = showMore && showLess
      ? (showMore.updatedAt >= showLess.updatedAt ? showMore : showLess)
      : showMore ?? showLess;

    if (preference?.kind === "show_more") {
      const delta = preference.strength * SHOW_MORE_MULTIPLIER;
      runningScore += delta;
      contributions.push({
        kind: "signal_boost",
        delta,
        label: "Show more like this",
        signalId: preference.id
      });
    } else if (preference?.kind === "show_less") {
      const delta = -(preference.strength * SHOW_LESS_MULTIPLIER);
      runningScore += delta;
      contributions.push({
        kind: "signal_penalty",
        delta,
        label: "Show less like this",
        signalId: preference.id
      });
    }

    const prefer = getEffectiveSignal(entityType, rec.id, "prefer", ownerAccountId);
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
  }

  if (ownerAccountId && reviewerAccountId) {
    const trustResult = computeReviewerTrustContribution(
      reviewerAccountId,
      undefined,
      ownerAccountId
    );
    if (trustResult.delta !== 0) {
      runningScore += trustResult.delta;
      contributions.push({
        kind: "reviewer_trust",
        delta: trustResult.delta,
        label: trustResult.delta > 0 ? "Trusted reviewer boost" : "Low-trust reviewer penalty"
      });
    }
  }

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

export function scoreAndFilterRecommendations(
  recs: Recommendation[],
  ownerAccountId?: string,
  reviewerAccountIds?: Map<string, string>
): ScoredRecommendation[] {
  const scored = recs.map((rec) => scoreRecommendation(
    rec,
    ownerAccountId
      ? { ownerAccountId, reviewerAccountId: reviewerAccountIds?.get(rec.id) }
      : undefined
  ));

  return scored
    .filter((recommendation) => !recommendation.scoreTrace.excluded)
    .sort((a, b) => b.scoreTrace.finalScore - a.scoreTrace.finalScore);
}
