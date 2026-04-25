import type { RankedSearchResult, SearchContext } from './types';
import { getBoostForDoc } from './feedback';

export function applyContextBoosts(
  results: RankedSearchResult[],
  context?: SearchContext
): RankedSearchResult[] {
  if (!context) return results;

  return results.map(result => {
    let boost = 0;
    const reasons = [...(result.reasons ?? [])];

    if (context.entityTypeHint && result.type === context.entityTypeHint) {
      boost += 2;
      reasons.push('context-entity');
    }

    if (context.surface === 'library' && result.source === 'local') {
      boost += 1.5;
      reasons.push('context-library');
    }

    if (context.preferOwnedLibrary && result.source === 'local') {
      boost += 2;
      reasons.push('context-owned');
    }

    const feedbackBoost = getBoostForDoc(context.surface ?? '', result.id);
    if (feedbackBoost > 0) {
      boost += feedbackBoost;
      reasons.push('feedback-boost');
    }

    return {
      ...result,
      score: result.score + boost,
      reasons
    };
  });
}
