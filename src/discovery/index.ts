/**
 * Phase 34 - Discovery and recommendations barrel exports.
 */

export type {
  Recommendation,
  RecommendationReason,
  RecommendationReasonType,
  DiscoverySource,
  DiscoveryControls,
  DiscoveryResult
} from "./types";

export { findRelatedBooks } from "./related-books";
export type { RelatedBooksOptions } from "./related-books";

export { findSimilarAuthors } from "./similar-authors";
export type { SimilarAuthorsOptions } from "./similar-authors";

export { findBecauseYouRead } from "./reading-history-engine";
export type { ReadingHistoryOptions } from "./reading-history-engine";

export {
  buildReasonExplanation,
  buildPrimaryExplanation,
  buildAllExplanations
} from "./explanation-builder";
export type { ExplanationKey } from "./explanation-builder";

export {
  getDiscoveryControls,
  setDiscoveryControls,
  excludeFromDiscovery,
  removeExclusion,
  resetDiscoveryControls
} from "./user-controls";
