import type { RankedSearchResult } from './types';

export type GroupedSearchResults = {
  editions: RankedSearchResult[];
  works: RankedSearchResult[];
  authors: RankedSearchResult[];
  all: RankedSearchResult[];
};

export function groupResults(results: RankedSearchResult[]): GroupedSearchResults {
  return {
    editions: results.filter((result) => result.type === 'edition'),
    works: results.filter((result) => result.type === 'work'),
    authors: results.filter((result) => result.type === 'author'),
    all: results
  };
}
