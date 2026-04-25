import type { RankedSearchResult } from './types';

export type RerankerProvider = {
  id: string;
  rerank(query: string, docs: RankedSearchResult[]): Promise<RankedSearchResult[]>;
};

let activeProvider: RerankerProvider | null = null;

export function registerRerankerProvider(provider: RerankerProvider) {
  activeProvider = provider;
}

export function getRerankerProvider(): RerankerProvider | null {
  return activeProvider;
}

// SAFE Jina adapter (expects proxy, not direct key usage)
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
            documents: docs.map(d => ({ text: d.title + ' ' + d.description }))
          })
        });

        if (!response.ok) return docs;

        const json = await response.json();
        const scores = json.results ?? [];

        return docs
          .map((doc, i) => ({ ...doc, score: doc.score + (scores[i]?.relevance_score ?? 0) }))
          .sort((a, b) => b.score - a.score);
      } catch {
        return docs;
      }
    }
  };
}
