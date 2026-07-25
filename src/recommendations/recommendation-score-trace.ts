import type {
  Recommendation,
  RecommendationReason,
  RecommendationScoreTrace,
  RecommendationScoreTraceContribution
} from "../discovery/types";
import {
  applyDiscoveryFeedbackScore,
  buildRecommendationTargetKey,
  type DiscoveryFeedbackPolicy,
  type DiscoveryFeedbackState
} from "./discovery-signal-runtime";

const USER_SIGNAL_DELTA = 0.15;

export type RecommendationPolicyEvaluation =
  | Readonly<{ included: true; recommendation: Recommendation }>
  | Readonly<{ included: false; scoreTrace: RecommendationScoreTrace }>;

export function buildRecommendationScoreTrace(
  recommendation: Pick<Recommendation, "id" | "entityType" | "score" | "reasons">,
  policy: Pick<DiscoveryFeedbackPolicy, "stateByTarget">
): RecommendationScoreTrace {
  return buildTrace(recommendation, policy, false);
}

export function evaluateRecommendationPolicy(
  recommendation: Recommendation,
  policy: Pick<DiscoveryFeedbackPolicy, "stateByTarget">
): RecommendationPolicyEvaluation {
  const state = getFeedbackState(recommendation, policy);
  const suppressed = state === "not_interested" || state === "suppress";
  const scoreTrace = buildTrace(recommendation, policy, suppressed);

  if (suppressed) {
    return Object.freeze({ included: false, scoreTrace });
  }

  return Object.freeze({
    included: true,
    recommendation: Object.freeze({
      ...recommendation,
      score: scoreTrace.finalScore,
      scoreTrace
    })
  });
}

export function attachRecommendationScoreTrace(
  recommendation: Recommendation,
  policy: Pick<DiscoveryFeedbackPolicy, "stateByTarget">
): Recommendation {
  const evaluation = evaluateRecommendationPolicy(recommendation, policy);
  if (!evaluation.included) {
    throw new Error("Cannot attach a visible score trace to a hard-suppressed recommendation");
  }
  return evaluation.recommendation;
}

function buildTrace(
  recommendation: Pick<Recommendation, "id" | "entityType" | "score" | "reasons">,
  policy: Pick<DiscoveryFeedbackPolicy, "stateByTarget">,
  includeSuppression: boolean
): RecommendationScoreTrace {
  const baseScore = normalizeFiniteScore(recommendation.score);
  const reasonContributions = recommendation.reasons.map(buildReasonContribution);
  const state = getFeedbackState(recommendation, policy);
  const contributions: RecommendationScoreTraceContribution[] = [...reasonContributions];

  if (state === "show_more" || state === "show_less") {
    contributions.push(Object.freeze({
      id: `user_signal:${state}`,
      kind: "user_signal",
      labelKey: `discovery.feedback.${state}`,
      delta: state === "show_more" ? USER_SIGNAL_DELTA : -USER_SIGNAL_DELTA,
      editableSignal: state
    }));
  }

  const finalScore = normalizeFiniteScore(applyDiscoveryFeedbackScore(
    { ...recommendation, score: baseScore },
    policy
  ));

  return Object.freeze({
    baseScore,
    finalScore,
    contributions: Object.freeze(contributions),
    hardSuppressions: Object.freeze(
      includeSuppression && state ? [`user_signal:${state}`] : []
    )
  });
}

function getFeedbackState(
  recommendation: Pick<Recommendation, "id" | "entityType">,
  policy: Pick<DiscoveryFeedbackPolicy, "stateByTarget">
): DiscoveryFeedbackState | undefined {
  return policy.stateByTarget[
    buildRecommendationTargetKey(recommendation.entityType, recommendation.id)
  ];
}

function buildReasonContribution(
  reason: RecommendationReason,
  index: number
): RecommendationScoreTraceContribution {
  const confidence = clamp01(reason.confidence);
  return Object.freeze({
    id: `reason:${reason.type}:${reason.sourceId ?? index}`,
    kind: "reason",
    labelKey: reasonLabelKey(reason.type),
    labelParams: reason.sourceLabel ? reasonLabelParams(reason.type, reason.sourceLabel) : undefined,
    delta: 0,
    confidence
  });
}

function reasonLabelKey(type: RecommendationReason["type"]): string {
  switch (type) {
    case "same_author": return "discovery.reason.sameAuthor";
    case "same_work": return "discovery.reason.sameWork";
    case "similar_title": return "discovery.reason.similarTitle";
    case "because_you_read": return "discovery.reason.becauseYouRead";
    case "similar_author": return "discovery.reason.similarAuthor";
    case "popular_in_library": return "discovery.reason.popularInLibrary";
  }
}

function reasonLabelParams(
  type: RecommendationReason["type"],
  sourceLabel: string
): Readonly<Record<string, string>> | undefined {
  switch (type) {
    case "same_author":
    case "similar_author":
      return Object.freeze({ author: sourceLabel });
    case "same_work":
    case "similar_title":
    case "because_you_read":
      return Object.freeze({ title: sourceLabel });
    case "popular_in_library":
      return undefined;
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeFiniteScore(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
