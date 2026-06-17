/**
 * Phase 19 — Feedback policy.
 *
 * Defines the rules governing how local-only click/selection feedback
 * is collected, stored, applied, and deleted. This is the policy layer
 * that sits between the raw feedback storage (feedback.ts) and the
 * ranking pipeline (feedback-ranking.ts).
 *
 * PRIVACY CONTRACT:
 * - Feedback is stored ONLY in localStorage on this device.
 * - Feedback NEVER crosses account/device boundary without explicit sync.
 * - No remote upload is performed by default. A future sync policy must
 *   be opted into by the user (out of scope for Phase 19).
 * - The "Reset personalization" control wipes all feedback immediately.
 * - Feedback entries contain only: query text (truncated), docId, surface,
 *   reward, and timestamp. No document content, no private metadata.
 */

export type FeedbackSurface = "global" | "library" | "shelf" | "entity" | "activity" | "onboarding";

export type PersonalizationPreferences = {
  /** True when the user has enabled personalized ranking (default: true). */
  enabled: boolean;
  /** Per-surface weight multiplier so library feedback doesn't spill into global. */
  surfaceWeights: Record<FeedbackSurface, number>;
  /** Maximum number of feedback events stored per device. */
  maxStoredEvents: number;
  /** Decay half-life in days. Events older than this contribute less. */
  decayHalfLifeDays: number;
  /** Maximum boost a single document can receive from feedback. */
  maxBoostPerDoc: number;
};

const PREFS_KEY = "ryu.search.personalization.prefs.v1";

function getDefaultPreferences(): PersonalizationPreferences {
  return {
    enabled: true,
    surfaceWeights: {
      global: 1.0,
      library: 1.2,
      shelf: 1.0,
      entity: 0.8,
      activity: 0.5,
      onboarding: 0.3
    },
    maxStoredEvents: 500,
    decayHalfLifeDays: 7,
    maxBoostPerDoc: 3
  };
}

function loadPreferences(): PersonalizationPreferences {
  if (typeof localStorage === "undefined") return getDefaultPreferences();
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return getDefaultPreferences();
    const parsed = JSON.parse(raw);
    // Deep merge surfaceWeights so older stored prefs missing new keys
    // don't wipe the defaults for those surfaces.
    return {
      ...getDefaultPreferences(),
      ...parsed,
      surfaceWeights: {
        ...getDefaultPreferences().surfaceWeights,
        ...(parsed && typeof parsed === "object" ? parsed.surfaceWeights : null)
      }
    };
  } catch {
    return getDefaultPreferences();
  }
}

function savePreferences(prefs: PersonalizationPreferences): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Quota error — non-fatal.
  }
}

let cachedPreferences: PersonalizationPreferences | null = null;

export function getPersonalizationPreferences(): PersonalizationPreferences {
  if (!cachedPreferences) {
    cachedPreferences = loadPreferences();
  }
  return cachedPreferences;
}

export function setPersonalizationPreferences(
  patch: Partial<PersonalizationPreferences>
): PersonalizationPreferences {
  const current = getPersonalizationPreferences();
  const next: PersonalizationPreferences = {
    ...current,
    ...patch,
    // Deep merge surfaceWeights so partial updates don't wipe other keys.
    surfaceWeights: patch.surfaceWeights
      ? { ...current.surfaceWeights, ...patch.surfaceWeights }
      : current.surfaceWeights
  };
  cachedPreferences = next;
  savePreferences(next);
  return next;
}

export function resetPersonalizationPreferences(): PersonalizationPreferences {
  cachedPreferences = getDefaultPreferences();
  savePreferences(cachedPreferences);
  return cachedPreferences;
}

/**
 * Compute the effective boost weight for a given surface, accounting for
 * the per-surface multiplier and the global enabled flag.
 */
export function effectiveSurfaceWeight(surface: string | undefined): number {
  const prefs = getPersonalizationPreferences();
  if (!prefs.enabled) return 0;
  if (!surface) return 1;
  return prefs.surfaceWeights[surface as FeedbackSurface] ?? 1;
}

/** Visible for tests. */
export function _resetCachedPreferences(): void {
  cachedPreferences = null;
}
