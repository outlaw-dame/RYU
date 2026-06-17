import type { RankedSearchResult } from './types';
import { getBoostForDoc } from './feedback';
import { effectiveSurfaceWeight, getPersonalizationPreferences } from './personalization';
import type { FeedbackSurface } from './personalization';

export function applyFeedbackBoosts(
  query: string,
  results: RankedSearchResult[],
  surface?: FeedbackSurface
): RankedSearchResult[] {
  const prefs = getPersonalizationPreferences();

  // If personalization is disabled, return results unchanged.
  if (!prefs.enabled) return results;

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
