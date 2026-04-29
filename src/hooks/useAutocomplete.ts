import { useEffect, useState } from 'react';
import { autocomplete } from '@/search/autocomplete';

export type AutocompleteEdition = {
  id: string;
  title: string;
  subtitle?: string;
};

export function useAutocomplete(query: string) {
  const [results, setResults] = useState<AutocompleteEdition[]>([]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;

    const id = setTimeout(async () => {
      try {
        const next = await autocomplete(normalized);
        if (!cancelled) setResults(next as AutocompleteEdition[]);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query]);

  return results;
}
