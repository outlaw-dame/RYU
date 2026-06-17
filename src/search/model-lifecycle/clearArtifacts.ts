/**
 * Phase 14 — "Delete local AI/search artifacts" orchestrator.
 *
 * One function the user (and recovery flows) can call to fully reset the
 * on-device search runtime to a known-good deterministic state.
 *
 * Steps:
 *   1. Reset embedding provider to deterministic so no in-flight embed()
 *      can resurrect persisted data after we clear it.
 *   2. Drop the in-memory vector store entirely.
 *   3. Clear persisted vectors for the previously active provider.
 *   4. Reset cached extractor pipelines so subsequent runs fetch fresh.
 *   5. Best-effort eviction of CacheStorage entries that hold model weights.
 *   6. Best-effort deletion of transformers.js IndexedDB caches (HF tools
 *      use `transformers-cache` historically).
 *   7. Reset model status entries so the UI shows clean idle state.
 *
 * Every step is wrapped in try/catch — partial failures must NEVER throw,
 * because this is wired to a destructive UI control and we must always
 * leave the runtime in a recoverable state.
 */

import { resetEmbeddingProvider } from "../embedding-provider";
import {
  clearAllPersistedVectors,
  clearInMemoryVectorIndex
} from "../vector-index";
import { resetAllModelStatuses } from "./modelStatus";
import { listEmbeddingArtifactRecords, modelCacheNamespace } from "./modelRegistry";

export type ClearArtifactsReport = {
  resetProvider: boolean;
  clearedInMemory: boolean;
  clearedPersistedVectors: boolean;
  evictedCacheStorageEntries: number;
  evictedIndexedDbDatabases: string[];
  resetExtractors: number;
  resetStatuses: boolean;
  errors: string[];
};

/**
 * Module-level registry of extractor reset callbacks. Each provider that
 * caches a heavy pipeline (MiniLM, EmbeddingGemma) registers a reset hook
 * here so the orchestrator can drop those caches without importing the
 * provider modules eagerly.
 */
const extractorResetCallbacks = new Set<() => void>();

/**
 * Provider modules call this to register a reset hook. The hook is
 * invoked during clearAllLocalAIArtifacts to discard any cached extractor
 * pipeline so the next request must reload from scratch.
 */
export function registerExtractorResetHook(reset: () => void): () => void {
  extractorResetCallbacks.add(reset);
  return () => {
    extractorResetCallbacks.delete(reset);
  };
}

/** Visible for tests. */
export function _getExtractorResetHookCount(): number {
  return extractorResetCallbacks.size;
}

async function clearCacheStorageEntries(report: ClearArtifactsReport): Promise<void> {
  if (typeof caches === "undefined" || typeof caches.keys !== "function") return;

  try {
    const keys = await caches.keys();
    const namespaces = listEmbeddingArtifactRecords().map((record) =>
      modelCacheNamespace(record.id)
    );
    // Drop any cache that either matches our own namespace prefix OR matches
    // the well-known transformers.js / Hugging Face cache prefixes.
    const matchers = [
      ...namespaces,
      "transformers-cache",
      "huggingface",
      "hf-",
      "ryu:model:"
    ];

    for (const key of keys) {
      const match = matchers.some((m) => key.startsWith(m));
      if (!match) continue;
      try {
        const removed = await caches.delete(key);
        if (removed) report.evictedCacheStorageEntries += 1;
      } catch (error) {
        report.errors.push(`caches.delete ${key} failed`);
      }
    }
  } catch (error) {
    report.errors.push("caches.keys failed");
  }
}

async function clearTransformersIndexedDb(report: ClearArtifactsReport): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  // Known DB names used by transformers.js / @huggingface / onnxruntime.
  // We deliberately avoid `indexedDB.databases()` since Safari does not
  // implement it; we instead delete by the canonical names.
  const candidateNames = [
    "transformers-cache",
    "@huggingface/transformers",
    "transformers",
    "onnxruntime-web"
  ];

  for (const name of candidateNames) {
    try {
      await new Promise<void>((resolve) => {
        let settled = false;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
          }
          resolve();
        };
        // Defensive fallback: if no event fires within 5s assume failure
        // and continue, rather than blocking the UI indefinitely. The
        // timer is cleared in finish() once a real callback settles the
        // promise so we never leak a pending timeout.
        timeoutId = setTimeout(finish, 5000);
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => {
          report.evictedIndexedDbDatabases.push(name);
          finish();
        };
        request.onerror = () => {
          report.errors.push(`indexedDB.deleteDatabase ${name} errored`);
          finish();
        };
        request.onblocked = () => {
          // Another tab holds the DB open. Fall through — clearing remains
          // partial; this is acceptable for the user-visible reset action.
          report.errors.push(`indexedDB.deleteDatabase ${name} blocked`);
          finish();
        };
      });
    } catch (error) {
      report.errors.push(`indexedDB.deleteDatabase ${name} threw`);
    }
  }
}

/**
 * Public entrypoint. Resolves with a report describing exactly what was
 * cleared so the UI can confirm to the user without ambiguity.
 *
 * Never throws. Failures are recorded in `report.errors`.
 */
export async function clearAllLocalAIArtifacts(): Promise<ClearArtifactsReport> {
  const report: ClearArtifactsReport = {
    resetProvider: false,
    clearedInMemory: false,
    clearedPersistedVectors: false,
    evictedCacheStorageEntries: 0,
    evictedIndexedDbDatabases: [],
    resetExtractors: 0,
    resetStatuses: false,
    errors: []
  };

  // Order matters here.
  //
  // Step 1: clear persisted vectors FIRST, while the user-facing provider
  // identity is still whatever was active when they clicked the button.
  // Doing this after resetEmbeddingProvider() would only remove deterministic
  // rows and leave enhanced (MiniLM/EmbeddingGemma) vectors orphaned in
  // RxDB — exactly the bug the user asked us to delete.
  //
  // We also use clearAllPersistedVectors so we evict rows from previously-
  // active providers we may no longer know about (e.g. a registry version
  // bump retired one). The action is "delete local AI/search artifacts" —
  // the user expects EVERYTHING to be gone.
  try {
    await clearAllPersistedVectors();
    report.clearedPersistedVectors = true;
  } catch (error) {
    report.errors.push("clearAllPersistedVectors failed");
  }

  // Step 2: switch back to deterministic so any in-flight embed() racing
  // with us is rejected by the generation-counter check in indexDocument()
  // and cannot reintroduce vectors after we just cleared them.
  try {
    resetEmbeddingProvider();
    report.resetProvider = true;
  } catch (error) {
    report.errors.push("resetEmbeddingProvider failed");
  }

  // Step 3: drop the in-memory vector store regardless of database/provider.
  try {
    clearInMemoryVectorIndex();
    report.clearedInMemory = true;
  } catch (error) {
    report.errors.push("clearInMemoryVectorIndex failed");
  }

  // Step 4: drop cached extractor pipelines.
  for (const reset of extractorResetCallbacks) {
    try {
      reset();
      report.resetExtractors += 1;
    } catch (error) {
      report.errors.push("extractor reset hook failed");
    }
  }

  // Step 5: best-effort eviction of platform caches.
  await clearCacheStorageEntries(report);
  await clearTransformersIndexedDb(report);

  // Step 6: clear status surface so the UI returns to a clean idle state.
  try {
    resetAllModelStatuses();
    report.resetStatuses = true;
  } catch (error) {
    report.errors.push("resetAllModelStatuses failed");
  }

  return report;
}
