/**
 * Phase 20 — Federated search boundary public API.
 */

export {
  type SearchBoundaryConfig,
  type SearchTier,
  getSearchBoundaryConfig,
  isRemoteCacheExpired,
  isTierVisibleOnSurface,
  resetSearchBoundaryConfig,
  scopeToSearchTier,
  setSearchBoundaryConfig,
  shouldIndexForSemanticSearch
} from "./searchBoundary";

export {
  type EvictionReport,
  evictStaleRemoteCache
} from "./remoteCacheEviction";
