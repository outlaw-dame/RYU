/**
 * SearchProvider — React context that provides the search engine instance
 * and related hooks to the component tree.
 *
 * This is the app integration boundary. UI code should consume:
 *   - useSearch()
 *   - useProgressiveSearch()
 *   - useSearchHealth()
 *   - useSearchRepair()
 *
 * NOT low-level modules like orama.ts, vector-index.ts, or search.ts directly.
 */

import React, { createContext, useContext, useMemo, type ReactNode } from "react";
import { createRxDbOramaHybridSearchEngine } from "./hybrid";
import type { LocalHybridSearchEngine } from "./hybrid";

interface SearchContextType {
  engine: LocalHybridSearchEngine;
}

const SearchContext = createContext<SearchContextType | null>(null);

interface SearchProviderProps {
  children: ReactNode;
  /** Override the default engine (for testing or experimental engines). */
  engine?: LocalHybridSearchEngine;
}

/**
 * Provides the search engine to the React tree.
 * Place this near the root of the app (inside QueryClientProvider).
 */
export function SearchProvider({ children, engine }: SearchProviderProps): React.ReactElement {
  const [defaultEngine] = React.useState(() => createRxDbOramaHybridSearchEngine());
  const activeEngine = engine ?? defaultEngine;

  const value = useMemo<SearchContextType>(() => ({
    engine: activeEngine
  }), [activeEngine]);

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  );
}

/**
 * Access the search engine instance from the context.
 * Throws if used outside SearchProvider.
 */
export function useSearchEngine(): LocalHybridSearchEngine {
  const ctx = useContext(SearchContext);
  if (!ctx) {
    throw new Error("useSearchEngine must be used within a SearchProvider");
  }
  return ctx.engine;
}
