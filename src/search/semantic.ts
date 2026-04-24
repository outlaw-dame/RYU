import type { SemanticSearchProvider } from './types';

let provider: SemanticSearchProvider | null = null;

export function registerSemanticProvider(p: SemanticSearchProvider) {
  provider = p;
}

export async function semanticSearch(query: string) {
  if (!provider) return [];

  try {
    return await provider.search(query);
  } catch {
    return [];
  }
}
