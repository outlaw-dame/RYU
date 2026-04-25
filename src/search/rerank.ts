import type { RankedSearchResult } from './types';

export type RerankContext = {
  preferredTypes?: Partial<Record<RankedSearchResult['type'], number>>;
  now?: number;
};

const DAY_MS = 1000 * 60 * 60 * 24;

function freshnessBoost(updatedAt: string, now: number): number {
  const time = Date.parse(updatedAt);
  if (!Number.isFinite(time)) return 0;

  const ageDays = Math.max(0, (now - time) / DAY_MS);
  if (ageDays <= 7) return 1.5;
  if (ageDays <= 30) return 0.75;
  if (ageDays <= 180) return 0.25;
  return 0;
}

function graphBoost(result: RankedSearchResult): number {
  let boost = 0;

  if (result.type === 'edition' && result.reasons?.includes('isbn')) {
    boost += 3;
  }

  if (result.reasons?.includes('author')) {
    boost += 1;
  }

  if (result.reasons?.includes('enrichment')) {
    boost += 0.5;
  }

  return boost;
}

export function rerankResults(results: RankedSearchResult[], context: RerankContext = {}): RankedSearchResult[] {
  const now = context.now ?? Date.now();

  return results
    .map((result) => {
      const preferenceBoost = context.preferredTypes?.[result.type] ?? 0;
      const boost = freshnessBoost(result.updatedAt, now) + graphBoost(result) + preferenceBoost;

      return {
        ...result,
        score: result.score + boost,
        reasons: boost > 0 ? [...(result.reasons ?? []), 'rerank'] : result.reasons
      };
    })
    .sort((a, b) => b.score - a.score);
}
