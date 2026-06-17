import { useEffect, useState } from 'react';
import { searchAll } from '@/search/search';
import type { SearchContext } from '../search/types';

const DEFAULT_SEARCH_CONTEXT: SearchContext = { surface: "global" };

export function useSearch(query: string, context: SearchContext = DEFAULT_SEARCH_CONTEXT) {
  const [results, setResults] = useState<any>(null);

  useEffect(() => {
    if (!query) {
      setResults(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await searchAll(query, { context });
        if (!cancelled) setResults(res);
      } catch {
        if (!cancelled) setResults(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [query, context]);

  return results;
}
