/**
 * Phase 34 - Explanation builder.
 *
 * Generates human-readable explanations for recommendations.
 * Uses i18n keys so all user-facing text is translatable.
 */

import type { RecommendationReason } from "./types";

/**
 * i18n key for explanation text.
 * Components should pass these to t() from react-i18next.
 */
export type ExplanationKey = {
  key: string;
  params?: Record<string, string>;
};

/**
 * Build an i18n-ready explanation for a single reason.
 */
export function buildReasonExplanation(reason: RecommendationReason): ExplanationKey {
  switch (reason.type) {
    case "same_author":
      return {
        key: "discovery.reason.sameAuthor",
        params: reason.sourceLabel ? { author: reason.sourceLabel } : undefined
      };
    case "same_work":
      return {
        key: "discovery.reason.sameWork",
        params: reason.sourceLabel ? { title: reason.sourceLabel } : undefined
      };
    case "similar_title":
      return {
        key: "discovery.reason.similarTitle",
        params: reason.sourceLabel ? { title: reason.sourceLabel } : undefined
      };
    case "because_you_read":
      return {
        key: "discovery.reason.becauseYouRead",
        params: reason.sourceLabel ? { title: reason.sourceLabel } : undefined
      };
    case "similar_author":
      return {
        key: "discovery.reason.similarAuthor",
        params: reason.sourceLabel ? { author: reason.sourceLabel } : undefined
      };
    case "popular_in_library":
      return {
        key: "discovery.reason.popularInLibrary"
      };
  }
}

/**
 * Build explanations for all reasons attached to a recommendation.
 * Returns the primary (highest confidence) explanation.
 */
export function buildPrimaryExplanation(
  reasons: RecommendationReason[]
): ExplanationKey {
  if (reasons.length === 0) {
    return { key: "discovery.reason.recommended" };
  }

  // Sort by confidence descending and use the strongest reason
  const sorted = [...reasons].sort((a, b) => b.confidence - a.confidence);
  return buildReasonExplanation(sorted[0]);
}

/**
 * Build all explanations for a recommendation, sorted by confidence.
 */
export function buildAllExplanations(
  reasons: RecommendationReason[]
): ExplanationKey[] {
  if (reasons.length === 0) {
    return [{ key: "discovery.reason.recommended" }];
  }

  return [...reasons]
    .sort((a, b) => b.confidence - a.confidence)
    .map(buildReasonExplanation);
}
