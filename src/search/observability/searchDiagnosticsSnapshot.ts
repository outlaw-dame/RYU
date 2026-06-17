/**
 * Phase 17 — Search diagnostics snapshot.
 *
 * Aggregates all the observability data surfaces the debug console needs
 * into a single async-tolerant probe. Each subsection is independently
 * failable so a broken vector index never hides engine or queue state.
 *
 * PRIVACY: diagnostics NEVER include user content, query text, or
 * document bodies. Only aggregate counts, identifiers, and status enums.
 */

import type { RyuDatabase } from "../../db/client";
import { initializeDatabase } from "../../db/client";
import { getEmbeddingProvider, getEmbeddingProviderGeneration } from "../embedding-provider";
import { getSearchRuntimeStatus } from "../runtime-status";
import { inspectSearchIndexHealth, type SearchIndexHealth } from "../index-lifecycle";
import { getAllModelStatuses, type ModelStatus } from "../model-lifecycle";
import { probeStorageQuota, type StorageQuoteEstimate } from "../model-lifecycle/storageQuota";

export type SearchEngineDiagnostics = {
  /** Currently active embedding provider id. */
  providerId: string;
  /** Provider output dimensions. */
  providerDimensions: number;
  /** Monotonic provider generation counter. */
  providerGeneration: number;
  /** Runtime status snapshot (last fallback reason, last error, device tier, etc). */
  runtimeStatus: ReturnType<typeof getSearchRuntimeStatus>;
};

export type SearchIndexDiagnostics = {
  /** Full health report from inspectSearchIndexHealth. */
  health: SearchIndexHealth | null;
  /** Error description if health check failed. */
  healthError?: string;
};

export type SearchQueueDiagnostics = {
  /** Number of pending jobs in the write-through queue. */
  writeThroughPending: number;
  /** Number of active jobs in the write-through queue. */
  writeThroughActive: number;
};

export type SearchModelDiagnostics = {
  /** Per-artifact model status snapshot. */
  models: readonly ModelStatus[];
};

export type SearchStorageDiagnostics = {
  /** Storage quota probe result. */
  storage: StorageQuoteEstimate;
};

export type SearchDiagnosticsSnapshot = {
  /** Engine / provider state. */
  engine: SearchEngineDiagnostics;
  /** Search index health (counts, staleness, orphans). */
  index: SearchIndexDiagnostics;
  /** Write-through queue state. */
  queue: SearchQueueDiagnostics;
  /** On-device model statuses. */
  model: SearchModelDiagnostics;
  /** Storage probe. */
  storage: SearchStorageDiagnostics;
  /** Timestamp of this snapshot. */
  capturedAt: string;
};

/**
 * Capture a full diagnostics snapshot. Each section is independently
 * resilient — a failure in one section does not prevent others from
 * being captured. Never throws.
 */
export async function captureSearchDiagnosticsSnapshot(
  db?: RyuDatabase
): Promise<SearchDiagnosticsSnapshot> {
  let database: RyuDatabase | null = null;
  let dbInitError: string | undefined;

  try {
    database = db ?? await initializeDatabase();
  } catch (error) {
    dbInitError = error instanceof Error ? error.message : "Database initialization failed";
  }

  // Engine diagnostics (synchronous — never fails).
  const provider = getEmbeddingProvider();
  const engine: SearchEngineDiagnostics = {
    providerId: provider.id,
    providerDimensions: provider.dimensions,
    providerGeneration: getEmbeddingProviderGeneration(),
    runtimeStatus: getSearchRuntimeStatus()
  };

  // Index health (async, can fail).
  let index: SearchIndexDiagnostics;
  if (!database) {
    index = {
      health: null,
      healthError: dbInitError ?? "Database not available"
    };
  } else {
    try {
      const health = await inspectSearchIndexHealth(database);
      index = { health };
    } catch (error) {
      index = {
        health: null,
        healthError: error instanceof Error ? error.message : "Health check failed"
      };
    }
  }

  // Write-through queue (synchronous import to avoid circular deps).
  let queue: SearchQueueDiagnostics;
  try {
    const { importedSearchIndexQueue } = await import("../write-through-indexing");
    queue = {
      writeThroughPending: importedSearchIndexQueue.pending(),
      writeThroughActive: importedSearchIndexQueue.active()
    };
  } catch {
    queue = { writeThroughPending: 0, writeThroughActive: 0 };
  }

  // Model statuses (synchronous).
  const model: SearchModelDiagnostics = {
    models: getAllModelStatuses()
  };

  // Storage probe (async, never throws internally).
  const storage: SearchStorageDiagnostics = {
    storage: await probeStorageQuota()
  };

  return {
    engine,
    index,
    queue,
    model,
    storage,
    capturedAt: new Date().toISOString()
  };
}
