/**
 * Scope-aware search result filtering.
 *
 * Enforces privacy rules at search time so that:
 * - Private/local-only documents only appear in the owning user's library surface
 * - Cache-only documents are excluded from search results by default
 * - Public and followers-scoped documents appear in all surfaces
 *
 * This is a safety net — even if a document is incorrectly indexed with the
 * wrong scope, the filter prevents leakage at query time.
 */

import type { RankedSearchResult, SearchContext, SearchDocumentScope, SearchSurface } from "./types";

/**
 * Returns true if a document with the given scope is visible on the given surface.
 */
export function isScopeVisibleOnSurface(
  scope: SearchDocumentScope | undefined,
  surface: SearchSurface | undefined
): boolean {
  const effectiveScope = scope ?? "public";
  const effectiveSurface = surface ?? "global";

  switch (effectiveScope) {
    case "public":
      return true;

    case "followers":
      // Followers-scoped content is visible everywhere except cache-filtered surfaces
      return true;

    case "private":
    case "local-only":
      // Only visible in the user's own library or shelf surfaces
      return effectiveSurface === "library" || effectiveSurface === "shelf";

    case "cache-only":
      // Not searchable by default — only shown if explicitly requested
      return false;

    default:
      return true;
  }
}

/**
 * Filter search results by scope visibility for the given search context.
 * This is the primary privacy enforcement point at search time.
 */
export function filterResultsByScope<T extends RankedSearchResult>(
  results: T[],
  context?: SearchContext
): T[] {
  const surface = context?.surface;

  return results.filter((result) => {
    return isScopeVisibleOnSurface(result.scope, surface);
  });
}
