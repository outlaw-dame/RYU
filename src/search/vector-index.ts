import { embedText, cosineSimilarity, searchableText } from './embeddings';
import type { RankedSearchResult, SearchDocument } from './types';

const vectorStore = new Map<string, { vector: number[]; doc: SearchDocument }>();

export function indexDocument(doc: SearchDocument) {
  const text = searchableText(doc);
  const vector = embedText(text);
  vectorStore.set(doc.id, { vector, doc });
}

export function removeDocument(id: string) {
  vectorStore.delete(id);
}

export function semanticSearchLocal(query: string, limit = 20): RankedSearchResult[] {
  const queryVector = embedText(query);

  const results: RankedSearchResult[] = [];

  for (const { vector, doc } of vectorStore.values()) {
    const score = cosineSimilarity(queryVector, vector);

    if (score > 0.1) {
      results.push({
        ...doc,
        score,
        semanticScore: score
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
