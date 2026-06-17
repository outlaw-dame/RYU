import type { RankedSearchResult } from './types';
import { getBoostForDoc } from './feedback';
import { effectiveSurfaceWeight, getPersonalizationPreferences } from './personalization';
import { isSearchFeatureEnabled } from './release';

export function applyFeedbackBoosts(
  query: string,
  results: RankedSearchResult[],
  surface?: string
): RankedSearchResult[] {
  const prefs = getPersonalizationPreferences();

  // If personalization is disabled via preferences OR feature flag, pass through.
  if (!prefs.enabled || !isSearchFeatureEnabled('personalization')) return results;

  const surfaceWeight = effectiveSurfaceWeight(surface);
  if (surfaceWeight <= 0) return results;

  return results.map((result) => {
    const rawBoost = getBoostForDoc(query, result.id);

    if (rawBoost <= 0) return result;

    // Apply per-surface weight and cap at the policy maximum.
    const boost = Math.min(rawBoost * surfaceWeight, prefs.maxBoostPerDoc);

    return {
      ...result,
      score: result.score + boost,
      reasons: [...(result.reasons ?? []), 'feedback-boost']
    };
  });
}
