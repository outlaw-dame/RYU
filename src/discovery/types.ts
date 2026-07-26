/**
 * Phase 34 - Discovery and recommendations types.
 */

export type RecommendationReasonType =
  | "same_author"
  | "same_work"
  | "similar_title"
  | "because_you_read"
  | "similar_author"
  | "popular_in_library";

export type RecommendationReason = {
  type: RecommendationReasonType;
  /** The source entity that triggered this recommendation (e.g., the book you read). */
  sourceId?: string;
  /** Human-readable label of the source (e.g., book title or author name). */
  sourceLabel?: string;
  /** Confidence score 0.0 to 1.0. */
  confidence: number;
};

export type DiscoverySource =
  | "local_library"
  | "local_search"
  | "federated";

export type Recommendation = {
  /** The recommended entity ID (edition or author). */
  id: string;
  /** Entity type being recommended. */
  entityType: "edition" | "author";
  /** Title or name of the recommended entity. */
  title: string;
  /** Optional cover URL for editions. */
  coverUrl?: string;
  /** Optional author name for editions. */
  author?: string;
  /** Canonical candidate author IDs for author-level controls and suppression. */
  authorIds?: string[];
  /** Why this was recommended. */
  reasons: RecommendationReason[];
  /** Where this recommendation was sourced from. */
  source: DiscoverySource;
  /** Composite score for ranking recommendations. */
  score: number;
  /** ISO timestamp of when this recommendation was generated. */
  generatedAt: string;
};

export type DiscoveryControls = {
  enabled: boolean;
  excludedIds: string[];
  federatedEnabled: boolean;
};

export type DiscoveryResult = {
  recommendations: Recommendation[];
  source: DiscoverySource;
  generatedAt: string;
};
