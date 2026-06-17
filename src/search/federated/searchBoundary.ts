/**
 * Phase 20 — Federated/search boundary design.
 *
 * Architectural boundary separating local-first private search from
 * federated/global discovery. This module defines the taxonomy and
 * enforces the rules so no future feature accidentally treats local
 * private data as federated/searchable data.
 *
 * Search tiers (from most private to most public):
 *
 *   1. LOCAL PRIVATE  — user's own library, notes, drafts, local-only data.
 *      Never leaves the device. Never federated. Only visible to the owner
 *      on library/shelf surfaces.
 *
 *   2. LOCAL PUBLIC   — user's public reviews, ratings, shelves. Stored
 *      locally but MAY be discoverable by remote followers via AP.
 *
 *   3. REMOTE CACHE   — ActivityPub content from other instances that has
 *      been fetched and cached locally for offline access. Governed by
 *      visibility rules from the originating instance + local cache expiry.
 *
 *   4. FEDERATED DISCOVERY — server-side search fallback that queries the
 *      user's home instance or other BookWyrm/Mastodon instances. Results
 *      are ephemeral and not persisted unless the user explicitly imports.
 *
 * Key invariants:
 *   - Tier 1 content NEVER appears in Tier 3 or 4 results.
 *   - Tier 3 content expires and is evicted after its TTL.
 *   - Tier 4 results are not indexed locally unless imported.
 *   - Personalization data (Phase 19) NEVER crosses device boundaries
 *     unless explicit sync is configured.
 */

import type { SearchDocumentScope } from "../types";

export type SearchTier = "local-private" | "local-public" | "remote-cache" | "federated-discovery";

export type SearchBoundaryConfig = {
  /** Maximum age (ms) for remote-cache documents before eviction. */
  remoteCacheTtlMs: number;
  /** Whether federated discovery results may be persisted locally. */
  allowFederatedPersistence: boolean;
  /** Whether remote-cache content is indexed for local semantic search. */
  indexRemoteCacheVectors: boolean;
  /** Maximum number of remote-cache documents to retain. */
  maxRemoteCacheDocuments: number;
};

const DEFAULT_BOUNDARY_CONFIG: SearchBoundaryConfig = {
  // 7 days — matching common AP cache policies.
  remoteCacheTtlMs: 7 * 24 * 60 * 60 * 1000,
  // Federated discovery results are ephemeral by default.
  allowFederatedPersistence: false,
  // Remote cache IS indexed for local search (enhances offline experience)
  // but the scope filter ensures it stays in appropriate surfaces only.
  indexRemoteCacheVectors: true,
  // Cap at 10k cached remote documents to bound storage.
  maxRemoteCacheDocuments: 10_000
};

let config = { ...DEFAULT_BOUNDARY_CONFIG };

export function getSearchBoundaryConfig(): SearchBoundaryConfig {
  return config;
}

export function setSearchBoundaryConfig(patch: Partial<SearchBoundaryConfig>): SearchBoundaryConfig {
  config = { ...config, ...patch };
  return config;
}

export function resetSearchBoundaryConfig(): SearchBoundaryConfig {
  config = { ...DEFAULT_BOUNDARY_CONFIG };
  return config;
}

/**
 * Map a SearchDocumentScope to its search tier. Used by the eviction
 * and boundary enforcement logic to determine which rules apply.
 */
export function scopeToSearchTier(scope: SearchDocumentScope | undefined): SearchTier {
  switch (scope) {
    case "private":
    case "local-only":
      return "local-private";
    case "public":
    case "followers":
      return "local-public";
    case "cache-only":
      return "remote-cache";
    default:
      // Undefined scope defaults to local-public (safe to search locally).
      return "local-public";
  }
}

/**
 * Determine whether a document with the given scope should be indexed
 * for vector/semantic search. Remote-cache documents are only indexed
 * when `indexRemoteCacheVectors` is enabled. Federated discovery results
 * are NEVER indexed (they are ephemeral).
 */
export function shouldIndexForSemanticSearch(scope: SearchDocumentScope | undefined): boolean {
  const tier = scopeToSearchTier(scope);
  switch (tier) {
    case "local-private":
    case "local-public":
      return true;
    case "remote-cache":
      return config.indexRemoteCacheVectors;
    case "federated-discovery":
      return false;
  }
}

/**
 * Determine whether a remote-cache document has expired based on its
 * updatedAt timestamp and the configured TTL.
 */
export function isRemoteCacheExpired(updatedAt: string): boolean {
  const updatedAtMs = Date.parse(updatedAt);
  if (Number.isNaN(updatedAtMs)) return true; // Invalid date = expired
  return Date.now() - updatedAtMs > config.remoteCacheTtlMs;
}

/**
 * Visibility matrix defining which tiers are accessible from which surfaces.
 * Enforced by scope-filter.ts at query time; this function is for
 * documentation and test assertions.
 */
export function isTierVisibleOnSurface(tier: SearchTier, surface: string): boolean {
  switch (tier) {
    case "local-private":
      // Only visible on user's own library/shelf.
      return surface === "library" || surface === "shelf";
    case "local-public":
      // Visible everywhere.
      return true;
    case "remote-cache":
      // Visible on global/entity (discovery-like surfaces) but NOT on
      // library/shelf (those are the user's own content).
      return surface === "global" || surface === "entity" || surface === "activity";
    case "federated-discovery":
      // Only visible on the dedicated discovery/explore surface.
      return surface === "global";
  }
}
