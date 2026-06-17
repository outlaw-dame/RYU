/**
 * Phase 19 — Personalization and feedback policy public API.
 */

export {
  type FeedbackSurface,
  type PersonalizationPreferences,
  effectiveSurfaceWeight,
  getPersonalizationPreferences,
  resetPersonalizationPreferences,
  setPersonalizationPreferences
} from "./feedbackPolicy";

export {
  type ResetPersonalizationReport,
  resetAllPersonalization
} from "./resetPersonalization";
