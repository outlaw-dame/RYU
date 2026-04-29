import type { RyuDatabase } from '../db/client';

export type SearchEntityType = 'edition' | 'work' | 'author';

export type SearchSurface = 'global' | 'library' | 'shelf' | 'onboarding' | 'entity';

export type SearchContext = {
  surface?: SearchSurface;
  activeShelfId?: string;
  entityTypeHint?: SearchEntityType;
  preferOwnedLibrary?: boolean;
};

export type SearchDocument = {
  id: string;
  type: SearchEntityType;
  title: string;
  description: string;
  authorText: string;
  isbnText: string;
  enrichmentText: string;
  source: 'local';
  updatedAt: string;
};

export type RankedSearchResult = SearchDocument & {
  score: number;
  lexicalScore?: number;
  semanticScore?: number;
  reasons?: string[];
};

export type SearchOptions = {
  limit?: number;
  alpha?: number;
  context?: SearchContext;
  db?: RyuDatabase;
};

export type SemanticSearchProvider = {
  search(query: string, options?: SearchOptions): Promise<RankedSearchResult[]>;
};
