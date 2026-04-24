export type SearchEntityType = 'edition' | 'work' | 'author';

export type SearchDocument = {
  id: string;
  type: SearchEntityType;
  title: string;
  description: string;
  authorText: string;
  source: 'local';
  updatedAt: string;
};

export type RankedSearchResult = SearchDocument & {
  score: number;
  lexicalScore?: number;
  semanticScore?: number;
};

export type SearchOptions = {
  limit?: number;
  alpha?: number;
};
