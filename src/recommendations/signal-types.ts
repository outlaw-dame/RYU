/**
 * Recommendation signal type definitions.
 *
 * A signal represents a user's explicit or inferred preference about an
 * entity (author, work, genre, etc). Signals are the atomic units that
 * the recommendation scoring pipeline consumes.
 *
 * Key invariant: explicit signals ALWAYS override inferred signals.
 */

/** What kind of entity this signal targets. */
export type SignalEntityType =
  | "author"
  | "work"
  | "edition"
  | "series"
  | "publisher"
  | "genre"
  | "tag"
  | "trope"
  | "account"
  | "domain"
  | "source";

/** The type of preference being expressed. */
export type SignalKind =
  | "show_more"       // Positive affinity — boost this entity in recommendations
  | "show_less"       // Negative affinity — reduce this entity's ranking
  | "not_interested"  // Strong negative — actively avoid recommending
  | "suppress"        // Hard exclusion — never show in any surface
  | "prefer"          // Strong positive — actively seek out
  | "trusted"         // Reviewer trust — boost reviews from this account
  | "low_trust";      // Reviewer distrust — reduce reviews from this account

/** How this signal was created. */
export type SignalProvenance =
  | "user_explicit"    // User deliberately chose this (button click, menu selection)
  | "local_inference"  // System inferred from behavior (reading history, clicks)
  | "imported";        // Imported from another system or export file

/**
 * A single recommendation signal document.
 */
export interface RecommendationSignal {
  /** Unique identifier: `signal:{entityType}:{entityId}:{kind}:{provenance}` */
  id: string;
  /** The type of entity this signal applies to. */
  entityType: SignalEntityType;
  /** The specific entity ID (author ID, work ID, genre slug, etc). */
  entityId: string;
  /** What preference is being expressed. */
  kind: SignalKind;
  /** How strong this signal is (0.0 to 1.0). Higher = stronger effect. */
  strength: number;
  /** How this signal was created. */
  provenance: SignalProvenance;
  /** Optional human-readable reason (shown in "Why this?" UI). */
  reason?: string;
  /** Optional expiry (ISO timestamp). Signal stops applying after this. */
  expiresAt?: string;
  /** When this signal was created. */
  createdAt: string;
  /** When this signal was last updated. */
  updatedAt: string;
}

/**
 * Parameters for creating/updating a signal.
 */
export interface CreateSignalParams {
  entityType: SignalEntityType;
  entityId: string;
  kind: SignalKind;
  strength?: number;
  provenance?: SignalProvenance;
  reason?: string;
  /** Duration in milliseconds (converted to expiresAt). */
  durationMs?: number;
}

/**
 * Build the canonical signal ID.
 * This ensures one signal per entity+kind+provenance combination.
 */
export function buildSignalId(
  entityType: SignalEntityType,
  entityId: string,
  kind: SignalKind,
  provenance: SignalProvenance
): string {
  return `signal:${entityType}:${entityId}:${kind}:${provenance}`;
}

/**
 * Check if a signal has expired.
 */
export function isSignalExpired(signal: RecommendationSignal): boolean {
  if (!signal.expiresAt) return false;
  return Date.now() > Date.parse(signal.expiresAt);
}

/**
 * Check if a signal is active (not expired).
 */
export function isSignalActive(signal: RecommendationSignal): boolean {
  return !isSignalExpired(signal);
}
