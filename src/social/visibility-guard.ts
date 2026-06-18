/**
 * Phase 31 - Visibility guard.
 *
 * Enforces visibility rules for remote social content:
 * - Remote content respects origin visibility (public, unlisted, private, direct)
 * - Local cache follows scope tiers from searchBoundary.ts
 * - Private/followers-only content from other instances must NOT be cached
 *   or searchable beyond its intended scope
 *
 * This module is the single authority on whether remote social content
 * may be persisted, cached, or surfaced in search.
 */

import type { MastodonStatus } from "../sync/mastodon-client";
import type { SearchDocumentScope } from "../search/types";
import type { SearchTier } from "../search/federated/searchBoundary";
import { getSearchBoundaryConfig } from "../search/federated/searchBoundary";
import type { CacheEligibility, RemoteVisibility } from "./types";

/**
 * Map a Mastodon visibility string to the normalized RemoteVisibility type.
 */
export function parseVisibility(visibility: string | undefined): RemoteVisibility {
  switch (visibility) {
    case "public":
      return "public";
    case "unlisted":
      return "unlisted";
    case "private":
    case "followers":
      return "private";
    case "direct":
      return "direct";
    default:
      // Unknown visibility defaults to private (safe default)
      return "private";
  }
}

/**
 * Determine whether a status from a remote instance may be cached locally.
 *
 * Rules:
 * - public/unlisted: cacheable and searchable (within remote-cache tier)
 * - private (followers-only): NOT cacheable, NOT searchable
 * - direct: NOT cacheable, NOT searchable
 */
export function getCacheEligibility(status: MastodonStatus): CacheEligibility {
  const visibility = parseVisibility(status.visibility);

  switch (visibility) {
    case "public":
      return {
        cacheable: true,
        searchable: true
      };
    case "unlisted":
      return {
        cacheable: true,
        searchable: false,
        reason: "Unlisted content is cached for display but excluded from search results"
      };
    case "private":
      return {
        cacheable: false,
        searchable: false,
        reason: "Followers-only content must not be cached or made searchable"
      };
    case "direct":
      return {
        cacheable: false,
        searchable: false,
        reason: "Direct messages must never be cached or made searchable"
      };
  }
}

/**
 * Map remote visibility to the appropriate SearchDocumentScope for indexing.
 * Only public content gets indexed; unlisted is cache-only.
 */
export function visibilityToScope(visibility: RemoteVisibility): SearchDocumentScope {
  switch (visibility) {
    case "public":
      return "cache-only";
    case "unlisted":
      return "cache-only";
    case "private":
    case "direct":
      // Should never be indexed, but if called, restrict to the most private scope
      return "private";
  }
}

/**
 * Map remote visibility to the appropriate search tier.
 */
export function visibilityToSearchTier(visibility: RemoteVisibility): SearchTier {
  switch (visibility) {
    case "public":
    case "unlisted":
      return "remote-cache";
    case "private":
    case "direct":
      return "local-private";
  }
}

/**
 * Check whether a cached remote status has expired based on boundary config.
 */
export function isRemoteStatusExpired(status: MastodonStatus): boolean {
  const config = getSearchBoundaryConfig();
  const createdAt = Date.parse(status.created_at);
  if (Number.isNaN(createdAt)) return true;
  return Date.now() - createdAt > config.remoteCacheTtlMs;
}

/**
 * Filter an array of statuses to only those eligible for local caching.
 * Removes private, direct, and expired content.
 */
export function filterCacheableStatuses(statuses: MastodonStatus[]): MastodonStatus[] {
  return statuses.filter((status) => {
    const eligibility = getCacheEligibility(status);
    if (!eligibility.cacheable) return false;
    if (isRemoteStatusExpired(status)) return false;
    return true;
  });
}

/**
 * Filter an array of statuses to only those eligible for search indexing.
 * More restrictive than caching: only public content is searchable.
 */
export function filterSearchableStatuses(statuses: MastodonStatus[]): MastodonStatus[] {
  return statuses.filter((status) => {
    const eligibility = getCacheEligibility(status);
    return eligibility.searchable && !isRemoteStatusExpired(status);
  });
}

/**
 * Determine whether a status should be visible on a given activity surface.
 * All visibility levels are visible in the user's own activity feed (they
 * received them via their timeline), but caching/search restrictions still apply.
 */
export function isVisibleOnActivitySurface(status: MastodonStatus): boolean {
  // All statuses received via the user's home timeline are visible in the
  // activity feed - the server already enforced visibility when delivering them.
  // The guard here is only about caching and search, not display.
  return true;
}

/**
 * Get a summary of visibility restrictions for a status.
 * Useful for UI indicators showing why content has limited distribution.
 */
export function getVisibilityInfo(status: MastodonStatus): {
  visibility: RemoteVisibility;
  canCache: boolean;
  canSearch: boolean;
  restrictionLabel?: string;
} {
  const visibility = parseVisibility(status.visibility);
  const eligibility = getCacheEligibility(status);

  return {
    visibility,
    canCache: eligibility.cacheable,
    canSearch: eligibility.searchable,
    restrictionLabel: eligibility.reason
  };
}
