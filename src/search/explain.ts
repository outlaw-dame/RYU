import type { QueryIntent } from './intent';
import type { SearchContext, RankedSearchResult } from './types';

export type SearchExplanation = {
  intent: QueryIntent;
  context?: SearchContext;
  appliedAlpha: number;
  reasons: string[];
  stages: {
    lexical: number;
    semantic: number;
    fused: number;
  };
};

export function attachExplanations(
  results: RankedSearchResult[],
  intent: QueryIntent,
  context?: SearchContext
): (RankedSearchResult & { explanation: SearchExplanation })[] {
  return results.map((r) => ({
    ...r,
    explanation: {
      intent,
      context,
      appliedAlpha: intent.alpha,
      reasons: r.reasons ?? [],
      stages: {
        lexical: r.lexicalScore ?? 0,
        semantic: r.semanticScore ?? 0,
        fused: r.score
      }
    }
  }));
}
