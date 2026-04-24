export type SearchEntityType = 'edition' | 'work' | 'author';

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
};

export type SemanticSearchProvider = {
  search(query: string, options?: SearchOptions): Promise<RankedSearchResult[]>;
};
