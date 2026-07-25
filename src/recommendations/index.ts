export {
  USER_SIGNAL_ENTITY_TYPES,
  USER_SIGNAL_PROVENANCE,
  USER_SIGNAL_SCHEMA_VERSION,
  USER_SIGNAL_TYPES,
  type UserRecommendationSignalDoc,
  type UserSignalEntityType,
  type UserSignalProvenance,
  type UserSignalType
} from "./user-signal-schema";

export { userRecommendationSignalsCollection } from "./user-signal-rxdb";

export {
  buildUserSignalId,
  compareUserSignalPrecedence,
  createUserSignal,
  isUserSignalExpired,
  normalizeInstanceOrigin,
  selectEffectiveUserSignal,
  type UserSignalInput
} from "./user-signals";

export {
  buildUserSignalSelector,
  listUserSignals,
  normalizeUserSignalScope,
  removeUserSignal,
  resetInferredUserSignals,
  upsertUserSignal,
  UserSignalStoreError,
  type UserSignalPersistenceAdapter,
  type UserSignalQuery,
  type UserSignalScope
} from "./user-signal-store";

export {
  buildMigrationMarkerKey,
  LEGACY_DISCOVERY_CONTROLS_STORAGE_KEY,
  migrateLegacyDiscoveryExclusions,
  type LegacyDiscoveryEntityResolver,
  type LegacyDiscoveryMigrationOptions,
  type LegacyDiscoveryMigrationResult
} from "./legacy-discovery-migration";

export {
  applyDiscoveryFeedbackScore,
  buildRecommendationTargetKey,
  buildUserSignalScopeFromSession,
  loadDiscoveryExclusionIds,
  loadDiscoveryFeedbackPolicy,
  recordDiscoveryNotInterested,
  resetHiddenDiscoveryFeedback,
  type DiscoveryFeedbackPolicy,
  type DiscoveryFeedbackState,
  type DiscoverySignalRuntimeDependencies
} from "./discovery-signal-runtime";

export {
  feedbackDescription,
  feedbackLabel,
  getRecommendationFeedbackState,
  listRecommendationFeedbackOptions,
  RECOMMENDATION_FEEDBACK_STATES,
  setRecommendationFeedbackState,
  type RecommendationFeedbackDependencies,
  type RecommendationFeedbackResult,
  type RecommendationFeedbackState,
  type RecommendationFeedbackTarget
} from "./recommendation-feedback";

export {
  attachRecommendationScoreTrace,
  buildRecommendationScoreTrace,
  evaluateRecommendationPolicy,
  type RecommendationPolicyEvaluation
} from "./recommendation-score-trace";

export {
  getReviewerTrustState,
  REVIEWER_TRUST_STATES,
  reviewerTrustEffect,
  selectReviewerTrustState,
  setReviewerTrustState,
  type ReviewerTrustDependencies,
  type ReviewerTrustEffect,
  type ReviewerTrustState
} from "./reviewer-trust";

export {
  applyReviewerTrustRanking,
  loadReviewerTrustStateMap,
  type ReviewerAttributedCandidate,
  type ReviewerTrustExplanation,
  type ReviewerTrustRankedCandidate,
  type ReviewerTrustRankingDependencies,
  type ReviewerTrustStateMap
} from "./reviewer-trust-ranking";

export {
  createReviewerTrustManager,
  listReviewerTrustOptions,
  reviewerTrustStateDescription,
  reviewerTrustStateLabel,
  type ReviewerTrustManagementDependencies,
  type ReviewerTrustManagementSnapshot,
  type ReviewerTrustManagementStatus,
  type ReviewerTrustManager
} from "./reviewer-trust-management";
