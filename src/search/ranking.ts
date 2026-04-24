import type { RankedSearchResult, SearchDocument } from './types';

function lexicalScore(doc: SearchDocument): number {
  let score = 0;

  if (doc.title) score += 5;
  if (doc.description) score += 2;

  if (doc.type === 'edition') score += 3;
  if (doc.type === 'work') score += 2;
  if (doc.type === 'author') score += 1;

  return score;
}

export function rankLexical(docs: SearchDocument[]): RankedSearchResult[] {
  return docs
    .map(doc => ({
      ...doc,
      score: lexicalScore(doc),
      lexicalScore: lexicalScore(doc)
    }))
    .sort((a, b) => b.score - a.score);
}

export function dedupe(results: RankedSearchResult[]): RankedSearchResult[] {
  const seen = new Set<string>();

  return results.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

export function fuseResults(
  lexical: RankedSearchResult[],
  semantic: RankedSearchResult[],
  alpha = 0.7
): RankedSearchResult[] {
  const map = new Map<string, RankedSearchResult>();

  for (const r of lexical) {
    map.set(r.id, {
      ...r,
      score: (1 - alpha) * (r.lexicalScore || r.score)
    });
  }

  for (const r of semantic) {
    const existing = map.get(r.id);

    if (existing) {
      existing.score += alpha * (r.semanticScore || r.score);
    } else {
      map.set(r.id, {
        ...r,
        score: alpha * (r.semanticScore || r.score)
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.score - a.score);
}
