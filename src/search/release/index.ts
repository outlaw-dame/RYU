/**
 * Phase 22 — Release hardening public API.
 */

export {
  type SearchFeatureFlag,
  type SearchFeatureFlags,
  getSearchFeatureFlags,
  isSearchFeatureEnabled,
  resetSearchFeatureFlags,
  setSearchFeatureFlag
} from "./featureFlags";

export {
  type MigrationCheckResult,
  canDisableEnhancedSearch,
  canRecoverFromCorruptVectors,
  checkMigrationSafety,
  recordSuccessfulMigration
} from "./migrationSafety";
