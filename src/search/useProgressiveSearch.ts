/**
 * useProgressiveSearch — React hook for progressive hybrid search.
 *
 * Streams partial results as the pipeline advances:
 *   lexical → semantic → fused → complete
 *
 * Usage:
 *   const { results, stage, diagnostics, isSearching } = useProgressiveSearch(query, context);
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { RankedSearchResult, SearchContext } from "./types";
import type { HybridSearchDiagnostics } from "./hybrid";
import type { ProgressiveSearchUpdate } from "./hybrid/progressiveSearch";
import { useSearchEngine } from "./SearchProvider";

export type ProgressiveSearchStage = "idle" | "lexical" | "semantic" | "fused" | "complete" | "error";

export type ProgressiveSearchState = {
  results: RankedSearchResult[];
  stage: ProgressiveSearchStage;
  diagnostics: HybridSearchDiagnostics | null;
  isSearching: boolean;
  error: string | null;
};

const EMPTY_RESULTS: RankedSearchResult[] = [];

export function useProgressiveSearch(
  query: string,
  context?: SearchContext
): ProgressiveSearchState {
  const engine = useSearchEngine();

  // Memoize context by its primitive fields to prevent infinite re-renders
  // when callers pass inline objects.
  const memoizedContext = useMemo(() => context, [
    context?.surface,
    context?.activeShelfId,
    context?.entityTypeHint,
    context?.preferOwnedLibrary,
    context?.currentUserId
  ]);

  const [state, setState] = useState<ProgressiveSearchState>({
    results: EMPTY_RESULTS,
    stage: "idle",
    diagnostics: null,
    isSearching: false,
    error: null
  });
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      // Bump requestId to invalidate any in-flight search from previous query
      requestIdRef.current++;
      setState({ results: EMPTY_RESULTS, stage: "idle", diagnostics: null, isSearching: false, error: null });
      return;
    }

    const requestId = ++requestIdRef.current;
    setState((prev) => ({ ...prev, isSearching: true, error: null, stage: "idle" }));

    const handleUpdate = (update: ProgressiveSearchUpdate) => {
      if (requestIdRef.current !== requestId) return;

      if (update.stage === "lexical" || update.stage === "semantic" || update.stage === "fused") {
        setState((prev) => ({
          ...prev,
          results: update.results,
          stage: update.stage
        }));
      } else if (update.stage === "complete") {
        setState({
          results: update.response.results?.all ?? EMPTY_RESULTS,
          stage: "complete",
          diagnostics: update.response.diagnostics,
          isSearching: false,
          error: null
        });
      } else if (update.stage === "error") {
        setState((prev) => ({
          ...prev,
          stage: "error",
          // Non-recoverable errors should stop the loading indicator
          isSearching: update.error.recoverable ? prev.isSearching : false,
          error: update.error.message
        }));
      }
    };

    engine.searchProgressively(
      { query, options: memoizedContext ? { context: memoizedContext } : undefined },
      handleUpdate
    ).catch((err) => {
      if (requestIdRef.current !== requestId) return;
      setState((prev) => ({
        ...prev,
        isSearching: false,
        stage: "error",
        error: err instanceof Error ? err.message : "Search failed"
      }));
    });

    return () => {
      // Invalidate this request so stale callbacks are ignored
      requestIdRef.current++;
    };
  }, [query, memoizedContext, engine]);

  return state;
}
