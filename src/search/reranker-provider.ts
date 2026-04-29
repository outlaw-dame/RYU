export type RerankerProvider = {
  id: string;
  rerank(query: string, docs: import('./types').RankedSearchResult[]): Promise<import('./types').RankedSearchResult[]>;
};

let activeProvider: RerankerProvider | null = null;

export function registerRerankerProvider(provider: RerankerProvider) {
  activeProvider = provider;
}

export function clearRerankerProvider() {
  activeProvider = null;
}

export function getRerankerProvider(): RerankerProvider | null {
  return activeProvider;
}
