import type { RankedSearchResult } from './types';

const DEFAULT_EPSILON = 0.08;
const MAX_SWAP_WINDOW = 5;

function shouldExplore(epsilon: number): boolean {
  return Math.random() < epsilon;
}

function safeShuffle<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function applyExploration(
  results: RankedSearchResult[],
  epsilon: number = DEFAULT_EPSILON
): RankedSearchResult[] {
  if (!results.length) return results;

  if (!shouldExplore(epsilon)) return results;

  const head = results.slice(0, MAX_SWAP_WINDOW);
  const tail = results.slice(MAX_SWAP_WINDOW);

  const shuffled = safeShuffle(head).map((r) => ({
    ...r,
    reasons: [...(r.reasons ?? []), 'exploration']
  }));

  return [...shuffled, ...tail];
}
