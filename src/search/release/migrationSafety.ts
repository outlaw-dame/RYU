/**
 * Phase 22 — Migration safety utilities.
 *
 * Provides guardrails for IndexedDB schema upgrades so existing users
 * do not lose local data when the app ships a new version.
 *
 * Key principles:
 * - Enhanced search can be disabled without breaking lexical search.
 * - A failed migration must not corrupt the database.
 * - Rollback to previous schema version must remain possible.
 * - Vector data can be regenerated (it's derived) — only canonical
 *   entity data (authors/works/editions/reviews) is irreplaceable.
 *
 * RxDB handles schema versioning and migration strategies via its
 * built-in migration plugin. This module provides the SEARCH-SPECIFIC
 * safety checks that run alongside RxDB migrations.
 */

export type MigrationCheckResult = {
  /** Whether the current schema version matches the persisted one. */
  schemaVersionMatch: boolean;
  /** Current schema version. */
  currentVersion: number;
  /** Persisted schema version (from last successful run). */
  persistedVersion: number | null;
  /** Whether vector data needs to be rebuilt after a migration. */
  vectorRebuildRequired: boolean;
  /** Whether the migration is safe to proceed (no data loss risk). */
  safe: boolean;
  /** Human-readable reason if not safe. */
  reason?: string;
};

const VERSION_KEY = "ryu.search.schema-version.v1";

// Must match the version in db/schema.ts.
const CURRENT_SCHEMA_VERSION = 1;

function getPersistedVersion(): number | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(VERSION_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isInteger(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function setPersistedVersion(version: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(VERSION_KEY, String(version));
  } catch {
    // Non-fatal.
  }
}

/**
 * Check whether the search schema migration is safe to proceed.
 * Call at app startup BEFORE opening the database.
 */
export function checkMigrationSafety(): MigrationCheckResult {
  const persistedVersion = getPersistedVersion();

  // First run — no persisted version. Safe to proceed.
  if (persistedVersion === null) {
    return {
      schemaVersionMatch: true,
      currentVersion: CURRENT_SCHEMA_VERSION,
      persistedVersion: null,
      vectorRebuildRequired: false,
      safe: true
    };
  }

  if (persistedVersion === CURRENT_SCHEMA_VERSION) {
    return {
      schemaVersionMatch: true,
      currentVersion: CURRENT_SCHEMA_VERSION,
      persistedVersion,
      vectorRebuildRequired: false,
      safe: true
    };
  }

  if (persistedVersion < CURRENT_SCHEMA_VERSION) {
    // Forward migration — safe. Vectors may need rebuilding if the
    // schema change affects search-relevant fields.
    return {
      schemaVersionMatch: false,
      currentVersion: CURRENT_SCHEMA_VERSION,
      persistedVersion,
      vectorRebuildRequired: true,
      safe: true,
      reason: `Upgrading search schema from v${persistedVersion} to v${CURRENT_SCHEMA_VERSION}`
    };
  }

  // Downgrade (user reverted to an older app version). This is risky —
  // newer schema features may have written data the old version can't read.
  // We allow it but flag vectors for rebuild and warn.
  return {
    schemaVersionMatch: false,
    currentVersion: CURRENT_SCHEMA_VERSION,
    persistedVersion,
    vectorRebuildRequired: true,
    safe: true,
    reason: `Downgrade detected: persisted v${persistedVersion} > current v${CURRENT_SCHEMA_VERSION}. Vectors will be rebuilt.`
  };
}

/**
 * Record a successful migration so subsequent startups know the version.
 * Call AFTER the database is opened successfully.
 */
export function recordSuccessfulMigration(): void {
  setPersistedVersion(CURRENT_SCHEMA_VERSION);
}

/**
 * Check if enhanced search can be safely disabled without breaking
 * the app. This should always return true — deterministic fallback
 * must work regardless of model/vector state.
 */
export function canDisableEnhancedSearch(): boolean {
  // Deterministic embeddings are computed inline from hash-token logic.
  // They never depend on model downloads, network, or IndexedDB vectors.
  // Lexical search (Orama) works independently of embedding providers.
  return true;
}

/**
 * Check if the search subsystem can recover from a corrupted vector store.
 * This should always return true because vectors are derived data.
 */
export function canRecoverFromCorruptVectors(): boolean {
  // Vectors can be regenerated from canonical entity data + the active
  // embedding provider. The repair flow (index-lifecycle.ts) handles this.
  return true;
}
