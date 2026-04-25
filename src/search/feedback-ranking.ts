import type { RankedSearchResult } from './types';
import { getBoostForDoc } from './feedback';

export function applyFeedbackBoosts(query: string, results: RankedSearchResult[]): RankedSearchResult[] {
  return results.map((result) => {
    const boost = getBoostForDoc(query, result.id);

    if (boost <= 0) return result;

    return {
      ...result,
      score: result.score + boost,
      reasons: [...(result.reasons ?? []), 'feedback-boost']
    };
  });
}
