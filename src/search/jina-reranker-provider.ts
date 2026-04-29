import type { RerankerProvider } from './reranker-provider';
import type { RankedSearchResult } from './types';

function docText(doc: RankedSearchResult): string {
  return [doc.title, doc.authorText, doc.description, doc.enrichmentText]
    .filter(Boolean)
    .join(' ')
    .slice(0, 4096);
}

export function createJinaReranker(apiUrl: string): RerankerProvider {
  return {
    id: 'jina-reranker-m0',
    rerank: async (query, docs) => {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'jina-reranker-m0',
            query,
            documents: docs.map((doc) => ({ text: docText(doc) }))
          })
        });

        if (!response.ok) {
          return docs;
        }

        const json = await response.json();
        const scores = json.results ?? [];

        return docs
          .map((doc, index) => ({
            ...doc,
            score: doc.score + (scores[index]?.relevance_score ?? 0)
          }))
          .sort((a, b) => b.score - a.score);
      } catch {
        return docs;
      }
    }
  };
}