import type { RankedSearchResult } from './types';

export type GroupedSearchResults<T extends RankedSearchResult = RankedSearchResult> = {
  editions: T[];
  works: T[];
  authors: T[];
  reviews: T[];
  all: T[];
};

export function groupResults<T extends RankedSearchResult>(results: T[]): GroupedSearchResults<T> {
  return {
    editions: results.filter((result) => result.type === 'edition'),
    works: results.filter((result) => result.type === 'work'),
    authors: results.filter((result) => result.type === 'author'),
    reviews: results.filter((result) => result.type === 'review'),
    all: results
  };
}
