import type { UserRecommendationSignalDoc } from "./user-signal-schema";
import {
  reviewerTrustEffect,
  selectReviewerTrustState,
  type ReviewerTrustState
} from "./reviewer-trust";
import {
  listUserSignals,
  normalizeUserSignalScope,
  type UserSignalQuery,
  type UserSignalScope
} from "./user-signal-store";

const MAX_REVIEWERS_PER_CANDIDATE = 64;
const MAX_REVIEWERS_PER_BATCH = 2048;

export type ReviewerTrustStateMap = ReadonlyMap<string, ReviewerTrustState>;

export type ReviewerTrustRankingDependencies = {
  listSignals?: (query: UserSignalQuery) => Promise<UserRecommendationSignalDoc[]>;
};

export type ReviewerAttributedCandidate<T> = {
  value: T;
  baseScore: number;
  /** Verified account IDs attached by the recommendation source. */
  reviewerAccountIds: readonly string[];
};

export type ReviewerTrustExplanation = {
  reviewerAccountId: string;
  state: ReviewerTrustState;
  scoreAdjustment: number;
  hardSuppressed: boolean;
};

export type ReviewerTrustRankedCandidate<T> = {
  value: T;
  baseScore: number;
  score: number;
  hardSuppressed: boolean;
  reviewerTrust: ReviewerTrustExplanation[];
};

/**
 * Loads all explicit reviewer signals for one authenticated scope in a single
 * repository query, then resolves each requested reviewer locally. This avoids
 * an N+1 query pattern and never accepts owner scope from recommendation data.
 */
export async function loadReviewerTrustStateMap(
  scope: UserSignalScope,
  reviewerAccountIds: readonly string[],
  dependencies: ReviewerTrustRankingDependencies = {},
  now = Date.now()
): Promise<Map<string, ReviewerTrustState>> {
  const canonicalScope = normalizeUserSignalScope(scope);
  const requestedIds = normalizeReviewerIds(reviewerAccountIds, MAX_REVIEWERS_PER_BATCH);
  const requested = new Set(requestedIds);
  const result = new Map<string, ReviewerTrustState>();

  for (const reviewerId of requestedIds) result.set(reviewerId, "neutral");
  if (requestedIds.length === 0) return result;

  const signals = await (dependencies.listSignals ?? listUserSignals)({
    ...canonicalScope,
    entityType: "account",
    provenance: "user_explicit"
  });

  const grouped = new Map<string, UserRecommendationSignalDoc[]>();
  for (const signal of signals) {
    if (!requested.has(signal.entityId)) continue;
    const group = grouped.get(signal.entityId) ?? [];
    group.push(signal);
    grouped.set(signal.entityId, group);
  }

  for (const reviewerId of requestedIds) {
    result.set(reviewerId, selectReviewerTrustState(grouped.get(reviewerId) ?? [], now));
  }
  return result;
}

/**
 * Applies explicit reviewer trust without allowing multiple trusted reviewers
 * to stack into an unbounded boost. Any muted/blocked reviewer hard-suppresses
 * the candidate. Otherwise, the aggregate adjustment is capped to [-0.2, 0.2].
 */
export function applyReviewerTrustRanking<T>(
  candidates: readonly ReviewerAttributedCandidate<T>[],
  states: ReviewerTrustStateMap,
  options: { includeSuppressed?: boolean } = {}
): ReviewerTrustRankedCandidate<T>[] {
  const ranked = candidates.map((candidate, index) => {
    if (!Number.isFinite(candidate.baseScore)) {
      throw new Error("Reviewer-attributed candidate baseScore must be finite");
    }

    const reviewerIds = normalizeReviewerIds(
      candidate.reviewerAccountIds,
      MAX_REVIEWERS_PER_CANDIDATE
    );
    const explanations = reviewerIds.map((reviewerAccountId) => {
      const state = states.get(reviewerAccountId) ?? "neutral";
      const effect = reviewerTrustEffect(state);
      return {
        reviewerAccountId,
        state,
        scoreAdjustment: effect.scoreAdjustment,
        hardSuppressed: effect.hardSuppressed
      } satisfies ReviewerTrustExplanation;
    });

    const hardSuppressed = explanations.some((item) => item.hardSuppressed);
    const positive = Math.max(0, ...explanations.map((item) => item.scoreAdjustment));
    const negative = Math.min(0, ...explanations.map((item) => item.scoreAdjustment));
    const adjustment = Math.max(-0.2, Math.min(0.2, positive + negative));

    return {
      index,
      value: candidate.value,
      baseScore: candidate.baseScore,
      score: candidate.baseScore + adjustment,
      hardSuppressed,
      reviewerTrust: explanations
    };
  });

  return ranked
    .filter((candidate) => options.includeSuppressed === true || !candidate.hardSuppressed)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ index: _index, ...candidate }) => candidate);
}

function normalizeReviewerIds(values: readonly string[], maximum: number): string[] {
  if (!Array.isArray(values)) throw new Error("Reviewer account IDs must be an array");
  if (values.length > maximum) throw new Error("Too many reviewer account IDs");

  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) throw new Error("Reviewer account ID is required");
    if (normalized.length > 2048) throw new Error("Reviewer account ID is too long");
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
