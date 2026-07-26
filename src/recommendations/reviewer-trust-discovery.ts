import { getDatabase, type RyuDatabase } from "../db/client";
import type { Recommendation, RecommendationScoreTraceContribution } from "../discovery/types";
import { getVerifiedReviewerAttribution } from "../reviews/reviewer-attribution";
import {
  applyReviewerTrustRanking,
  loadReviewerTrustStateMap,
  type ReviewerTrustStateMap
} from "./reviewer-trust-ranking";
import type { UserSignalScope } from "./user-signal-store";

export type ReviewerTrustDiscoveryDependencies = {
  loadReviewerIds?: (
    editionIds: readonly string[]
  ) => Promise<ReadonlyMap<string, readonly string[]>>;
  loadStates?: (
    scope: UserSignalScope,
    reviewerAccountIds: readonly string[]
  ) => Promise<ReviewerTrustStateMap>;
};

export async function applyVerifiedReviewerTrustToDiscovery(
  recommendations: readonly Recommendation[],
  scope: UserSignalScope,
  dependencies: ReviewerTrustDiscoveryDependencies = {}
): Promise<Recommendation[]> {
  const editionIds = recommendations
    .filter((item) => item.entityType === "edition")
    .map((item) => item.id);
  if (editionIds.length === 0) return [...recommendations];

  const reviewerIdsByEdition = await (
    dependencies.loadReviewerIds ?? loadVerifiedReviewerIdsByEdition
  )(editionIds);
  const allReviewerIds = [...new Set(
    [...reviewerIdsByEdition.values()].flatMap((ids) => [...ids])
  )];
  if (allReviewerIds.length === 0) return [...recommendations];

  const states = await (dependencies.loadStates ?? loadReviewerTrustStateMap)(
    scope,
    allReviewerIds
  );
  const ranked = applyReviewerTrustRanking(
    recommendations.map((recommendation) => ({
      value: recommendation,
      baseScore: recommendation.score,
      reviewerAccountIds: recommendation.entityType === "edition"
        ? reviewerIdsByEdition.get(recommendation.id) ?? []
        : []
    })),
    states
  );

  return ranked.map((candidate) => attachReviewerTrustTrace(
    candidate.value,
    candidate.score - candidate.baseScore
  ));
}

async function loadVerifiedReviewerIdsByEdition(
  editionIds: readonly string[]
): Promise<ReadonlyMap<string, readonly string[]>> {
  const normalizedIds = [...new Set(editionIds.map((id) => id.trim()).filter(Boolean))];
  const result = new Map<string, string[]>();
  if (normalizedIds.length === 0) return result;

  const db = await getDatabase();
  const documents = await findReviewsForEditions(db, normalizedIds);
  const allowedEditions = new Set(normalizedIds);

  for (const document of documents) {
    const review = document.toJSON();
    if (!allowedEditions.has(review.editionId)) continue;
    const attribution = getVerifiedReviewerAttribution(review);
    if (!attribution) continue;
    const ids = result.get(review.editionId) ?? [];
    if (!ids.includes(attribution.accountId)) ids.push(attribution.accountId);
    result.set(review.editionId, ids);
  }

  return new Map(
    [...result.entries()].map(([editionId, ids]) => [editionId, Object.freeze([...ids])])
  );
}

async function findReviewsForEditions(
  db: RyuDatabase,
  editionIds: readonly string[]
) {
  return db.reviews.find({
    selector: { editionId: { $in: [...editionIds] } }
  }).exec();
}

function attachReviewerTrustTrace(
  recommendation: Recommendation,
  adjustment: number
): Recommendation {
  if (adjustment === 0) return recommendation;
  const existingTrace = recommendation.scoreTrace;
  const contribution: RecommendationScoreTraceContribution = Object.freeze({
    id: `reviewer_trust:${adjustment > 0 ? "positive" : "negative"}`,
    kind: "reviewer_trust",
    labelKey: adjustment > 0
      ? "discovery.reviewerTrust.positive"
      : "discovery.reviewerTrust.negative",
    delta: adjustment
  });
  const contributions = Object.freeze([
    ...(existingTrace?.contributions ?? []),
    contribution
  ]);
  const scoreTrace = Object.freeze({
    baseScore: existingTrace?.baseScore ?? recommendation.score,
    finalScore: recommendation.score + adjustment,
    contributions,
    hardSuppressions: existingTrace?.hardSuppressions ?? Object.freeze([])
  });

  return Object.freeze({
    ...recommendation,
    score: scoreTrace.finalScore,
    scoreTrace
  });
}
