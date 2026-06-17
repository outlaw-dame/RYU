/**
 * Phase 21 — Search i18n/a11y public API.
 */

export {
  type QueryScript,
  containsCJK,
  detectQueryScript,
  foldDiacritics,
  isRTLText,
  normalizeForI18nSearch
} from "./queryNormalization";

export {
  type AccessibleExplanation,
  type ExplanationReason,
  buildAccessibleExplanation,
  buildSearchStatusAnnouncement
} from "./accessibleExplanations";
