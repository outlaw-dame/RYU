import type { RankedSearchResult, SearchDocument } from './types';

function normalize(text: string): string {
  return text.toLowerCase();
}

function includes(text: string, query: string): boolean {
  return normalize(text).includes(normalize(query));
}

function scoreField(text: string, query: string, weight: number): number {
  if (!text) return 0;
  if (includes(text, query)) return weight;
  return 0;
}

function computeScore(doc: SearchDocument, query: string): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Title (highest weight)
  const titleScore = scoreField(doc.title, query, 10);
  if (titleScore) reasons.push('title');
  score += titleScore;

  // Author
  const authorScore = scoreField(doc.authorText, query, 6);
  if (authorScore) reasons.push('author');
  score += authorScore;

  // Description
  const descScore = scoreField(doc.description, query, 3);
  if (descScore) reasons.push('description');
  score += descScore;

  // ISBN exact-ish
  const isbnScore = scoreField(doc.isbnText, query, 12);
  if (isbnScore) reasons.push('isbn');
  score += isbnScore;

  // Enrichment (lowest weight)
  const enrichScore = scoreField(doc.enrichmentText, query, 2);
  if (enrichScore) reasons.push('enrichment');
  score += enrichScore;

  // Type bias
  if (doc.type === 'edition') score += 3;
  if (doc.type === 'work') score += 2;
  if (doc.type === 'author') score += 1;

  return { score, reasons };
}

export function rankLexical(docs: SearchDocument[], query: string): RankedSearchResult[] {
  return docs
    .map(doc => {
      const { score, reasons } = computeScore(doc, query);
      return {
        ...doc,
        score,
        lexicalScore: score,
        reasons
      };
    })
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
