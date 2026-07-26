/**
 * Phase 17 — Search diagnostics snapshot.
 *
 * Aggregates all the observability data surfaces the debug console needs
 * into a single async-tolerant probe. Each subsection is independently
 * failable so a broken vector index never hides engine or queue state.
 *
 * PRIVACY: diagnostics NEVER include user content, query text, document
 * bodies, account identifiers, moderation state, or recommendation signals.
 */

import type { RyuDatabase } from "../../db/client";
import { initializeDatabase } from "../../db/client";
import { getEmbeddingProvider, getEmbeddingProviderGeneration } from "../embedding-provider";
import { getSearchRuntimeStatus } from "../runtime-status";
import { inspectSearchIndexHealth, type SearchIndexHealth } from "../index-lifecycle";
import { getAllModelStatuses, type ModelStatus } from "../model-lifecycle";
import { probeStorageQuota, type StorageQuoteEstimate } from "../model-lifecycle/storageQuota";
import {
  diagnosticErrorCode,
  sanitizeSearchRuntimeStatus
} from "./diagnosticPrivacy";

export type SearchEngineDiagnostics = {
  providerId: string;
  providerDimensions: number;
  providerGeneration: number;
  runtimeStatus: ReturnType<typeof getSearchRuntimeStatus>;
};

export type SearchIndexDiagnostics = {
  health: SearchIndexHealth | null;
  healthError?: string;
};

export type SearchQueueDiagnostics = {
  writeThroughPending: number;
  writeThroughActive: number;
};

export type SearchModelDiagnostics = {
  models: readonly ModelStatus[];
};

export type SearchStorageDiagnostics = {
  storage: StorageQuoteEstimate;
};

export type SearchDiagnosticsSnapshot = {
  engine: SearchEngineDiagnostics;
  index: SearchIndexDiagnostics;
  queue: SearchQueueDiagnostics;
  model: SearchModelDiagnostics;
  storage: SearchStorageDiagnostics;
  capturedAt: string;
};

/** Capture a privacy-bounded diagnostics snapshot. Never throws. */
export async function captureSearchDiagnosticsSnapshot(
  db?: RyuDatabase
): Promise<SearchDiagnosticsSnapshot> {
  let database: RyuDatabase | null = null;
  let databaseInitializationFailed = false;

  try {
    database = db ?? await initializeDatabase();
  } catch {
    databaseInitializationFailed = true;
  }

  const provider = getEmbeddingProvider();
  const engine: SearchEngineDiagnostics = {
    providerId: provider.id,
    providerDimensions: provider.dimensions,
    providerGeneration: getEmbeddingProviderGeneration(),
    runtimeStatus: sanitizeSearchRuntimeStatus(getSearchRuntimeStatus())
  };

  let index: SearchIndexDiagnostics;
  if (!database) {
    index = {
      health: null,
      healthError: diagnosticErrorCode(
        databaseInitializationFailed
          ? "database_initialization_failed"
          : "database_unavailable"
      )
    };
  } else {
    try {
      index = { health: await inspectSearchIndexHealth(database) };
    } catch {
      index = {
        health: null,
        healthError: diagnosticErrorCode("index_health_check_failed")
      };
    }
  }

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

  const model: SearchModelDiagnostics = {
    models: getAllModelStatuses()
  };

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
