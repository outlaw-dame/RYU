/**
 * Phase 19 — "Reset personalization" action.
 *
 * Provides a single function the user can call to wipe all local
 * feedback data, ranking preferences, and adaptive weights so search
 * returns to a clean, unpersonalized state.
 *
 * PRIVACY: this is a destructive action that the user explicitly invokes.
 * After reset, search rankings are determined solely by the base pipeline
 * (lexical + semantic + intent + context) with no prior-interaction bias.
 */

import { resetPersonalizationPreferences } from "./feedbackPolicy";
import { resetAdaptiveWeights } from "../weights";

const FEEDBACK_KEY = "ryu.search.feedback.v1";
const ALPHA_KEY = "ryu.search.alpha-feedback.v1";
const PREFERENCES_KEY = "ryu.search.personalization.prefs.v1";

export type ResetPersonalizationReport = {
  clearedFeedbackEvents: boolean;
  clearedAlphaWeights: boolean;
  clearedPreferences: boolean;
  errors: string[];
};

/**
 * Wipe all personalization data from this device. Returns a report of
 * what was cleared. Never throws.
 */
export function resetAllPersonalization(): ResetPersonalizationReport {
  const report: ResetPersonalizationReport = {
    clearedFeedbackEvents: false,
    clearedAlphaWeights: false,
    clearedPreferences: false,
    errors: []
  };

  // Clear feedback events.
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(FEEDBACK_KEY);
      report.clearedFeedbackEvents = true;
    }
  } catch (error) {
    report.errors.push("Failed to clear feedback events");
  }

  // Clear adaptive alpha weights.
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(ALPHA_KEY);
    }
    resetAdaptiveWeights();
    report.clearedAlphaWeights = true;
  } catch (error) {
    report.errors.push("Failed to clear adaptive weights");
  }

  // Reset personalization preferences to defaults.
  try {
    resetPersonalizationPreferences();
    report.clearedPreferences = true;
  } catch (error) {
    report.errors.push("Failed to reset personalization preferences");
  }

  return report;
}
