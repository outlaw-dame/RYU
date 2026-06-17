/**
 * Phase 14 — Model registry.
 *
 * Source of truth for the on-device embedding/reranker artifacts the app may load.
 * Each entry pins:
 *   - the canonical model identifier used by the loader
 *   - the expected vector dimensions
 *   - an approximate artifact size used for storage-quota gating
 *   - a registry version so we can evict stale local caches when models change
 *
 * Pinning lets us answer two product questions deterministically:
 *   1. "How much storage will this user spend if they enable Enhanced Search?"
 *   2. "Has the model we shipped changed since this user last downloaded it?"
 *
 * IMPORTANT: do NOT couple this registry to transformers.js internals. The
 * registry stays portable so we can later host artifacts on our own CDN with
 * SRI hashes without changing the consumers.
 */

export type EmbeddingArtifactId = "minilm" | "embeddinggemma";

export type EmbeddingArtifactRecord = {
  /** Stable id used by `runtime-settings.ts` and `runtime-status.ts`. */
  id: EmbeddingArtifactId;
  /** Display name used in settings UI strings. */
  displayName: string;
  /** Canonical model name passed to the underlying loader (e.g. transformers.js `pipeline`). */
  modelName: string;
  /** Pinned revision string. Lets us invalidate caches when we move to a new revision. */
  pinnedRevision: string;
  /** Output vector dimensions. Must match the provider implementation. */
  dimensions: number;
  /** Approximate compressed download size in bytes. Used for quota gating. */
  approximateSizeBytes: number;
  /** Quantization profile, recorded for diagnostics and parity checks. */
  quantization: "q4" | "q8" | "fp16" | "fp32";
};

const REGISTRY_VERSION = 1;

const ARTIFACTS: Record<EmbeddingArtifactId, EmbeddingArtifactRecord> = {
  minilm: {
    id: "minilm",
    displayName: "MiniLM (384d)",
    modelName: "Xenova/all-MiniLM-L6-v2",
    pinnedRevision: "main",
    dimensions: 384,
    // ~22 MB quantized.
    approximateSizeBytes: 22 * 1024 * 1024,
    quantization: "q8"
  },
  embeddinggemma: {
    id: "embeddinggemma",
    displayName: "EmbeddingGemma (768d)",
    modelName: "google/embeddinggemma-300m",
    pinnedRevision: "main",
    dimensions: 768,
    // ~300 MB q8 — drives the heavier quota gating.
    approximateSizeBytes: 300 * 1024 * 1024,
    quantization: "q8"
  }
};

export function getModelRegistryVersion(): number {
  return REGISTRY_VERSION;
}

export function getEmbeddingArtifactRecord(id: EmbeddingArtifactId): EmbeddingArtifactRecord {
  return ARTIFACTS[id];
}

export function listEmbeddingArtifactRecords(): readonly EmbeddingArtifactRecord[] {
  return Object.values(ARTIFACTS);
}

/**
 * Compose the cache namespace string used to scope per-model storage entries.
 * Including the registry version means bumping `REGISTRY_VERSION` will also
 * cause stale on-disk caches to miss their lookup, forcing a re-download.
 */
export function modelCacheNamespace(id: EmbeddingArtifactId): string {
  const record = ARTIFACTS[id];
  return `ryu:model:v${REGISTRY_VERSION}:${record.id}@${record.pinnedRevision}`;
}
