import { useEffect, useState } from 'react';
import { searchAll } from '@/search/search';

export function useSearch(query: string, context: import('../search/types').SearchContext = { surface: "global" }) {
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
  }, [query]);

  return results;
}
