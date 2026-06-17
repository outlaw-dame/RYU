/**
 * useSurfaceSearch — surface-aware progressive search hook.
 *
 * Combines useProgressiveSearch with surface configuration so each
 * app surface gets correct privacy, ranking, and entity type behavior
 * without manually constructing SearchContext.
 *
 * Usage:
 *   const search = useSurfaceSearch("dune", "library", { currentUserId });
 *   const search = useSurfaceSearch(query, "global");
 *   const search = useSurfaceSearch(query, "shelf", { activeShelfId });
 */

import { useMemo } from "react";
import type { SearchEntityType, SearchSurface } from "./types";
import { useProgressiveSearch, type ProgressiveSearchState } from "./useProgressiveSearch";
import { buildSearchContext } from "./surfaceConfig";

export type SurfaceSearchOptions = {
  currentUserId?: string;
  activeShelfId?: string;
  entityTypeHint?: SearchEntityType;
};

/**
 * Progressive search hook pre-configured for a specific app surface.
 *
 * Privacy enforcement:
 *   - global: only public/followers content visible
 *   - library: private/local-only visible if owned by currentUserId
 *   - shelf: shelf-scoped, owned
 *   - entity: related content context
 */
export function useSurfaceSearch(
  query: string,
  surface: SearchSurface,
  options?: SurfaceSearchOptions
): ProgressiveSearchState {
  const { currentUserId, activeShelfId, entityTypeHint } = options || {};

  const context = useMemo(
    () => buildSearchContext(surface, { currentUserId, activeShelfId, entityTypeHint }),
    [surface, currentUserId, activeShelfId, entityTypeHint]
  );

  return useProgressiveSearch(query, context);
}
