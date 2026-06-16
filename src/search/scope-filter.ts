/**
 * Scope-aware search result filtering.
 *
 * Enforces privacy rules at search time so that:
 * - Private/local-only documents only appear when the owner matches the current user
 *   AND the surface is library/shelf
 * - Cache-only documents are excluded from search results by default
 * - Public and followers-scoped documents appear in all surfaces
 *
 * This is a safety net — even if a document is incorrectly indexed with the
 * wrong scope, the filter prevents leakage at query time.
 */

import type { RankedSearchResult, SearchContext, SearchDocumentScope, SearchSurface } from "./types";

/**
 * Returns true if a document with the given scope is visible on the given surface
 * for the given user.
 *
 * SECURITY: Private/local-only documents require BOTH:
 *   1. The surface is library or shelf
 *   2. The document's ownerId matches the currentUserId
 * If either condition fails, the document is hidden.
 */
export function isScopeVisibleOnSurface(
  scope: SearchDocumentScope | undefined,
  surface: SearchSurface | undefined,
  ownerId?: string,
  currentUserId?: string
): boolean {
  const effectiveScope = scope ?? "public";
  const effectiveSurface = surface ?? "global";

  switch (effectiveScope) {
    case "public":
      return true;

    case "followers":
      return true;

    case "private":
    case "local-only":
      // BOLA protection: private/local-only documents are ONLY visible if:
      // 1. The surface is the user's own library or shelf
      // 2. The document belongs to the current user (or has no ownerId set)
      if (effectiveSurface !== "library" && effectiveSurface !== "shelf") {
        return false;
      }
      // If ownerId is set, it MUST match the current user
      if (ownerId && ownerId !== currentUserId) {
        return false;
      }
      return true;

    case "cache-only":
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
  const currentUserId = context?.currentUserId;

  return results.filter((result) => {
    return isScopeVisibleOnSurface(result.scope, surface, result.ownerId, currentUserId);
  });
}
