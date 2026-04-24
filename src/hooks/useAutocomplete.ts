import { useEffect, useState } from 'react';
import { autocomplete } from '@/search/autocomplete';

export function useAutocomplete(query: string) {
  const [results, setResults] = useState<any[]>([]);

  useEffect(() => {
    if (!query) return;

    const id = setTimeout(async () => {
      try {
        setResults(await autocomplete(query));
      } catch {
        setResults([]);
      }
    }, 150);

    return () => clearTimeout(id);
  }, [query]);

  return results;
}
