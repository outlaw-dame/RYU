/**
 * Phase 14 — Storage quota probe and low-memory adaptive fallback.
 *
 * Centralizes all calls into the StorageManager and Performance memory APIs
 * so we have one place to reason about device-side resource limits before
 * we attempt to download a multi-hundred-megabyte embedding model.
 *
 * The functions here are intentionally tolerant of missing browser APIs
 * (Safari, headless test runners) so a failed probe NEVER throws into the
 * search runtime configuration path. Worst case we degrade to standard
 * device-tier gating that already exists in `device-capabilities.ts`.
 */

import type { EmbeddingArtifactRecord } from "./modelRegistry";

export type StorageQuoteEstimate = {
  /** Total bytes allocated by this origin, when known. */
  usageBytes?: number;
  /** Storage quota for this origin, when known. */
  quotaBytes?: number;
  /** Bytes available before hitting the origin quota, when computable. */
  availableBytes?: number;
  /** True when the browser exposes the storage manager and persist hint. */
  isPersistent?: boolean;
  /** Explanation for diagnostics. Never includes private data. */
  reason: string;
};

/** Default headroom multiplier — we want at least 2x the artifact size free. */
const DEFAULT_HEADROOM_MULTIPLIER = 2;

/**
 * Probe browser storage. Always resolves — never throws.
 */
export async function probeStorageQuota(): Promise<StorageQuoteEstimate> {
  if (typeof navigator === "undefined" || !navigator.storage) {
    return { reason: "navigator.storage unavailable" };
  }

  const storage = navigator.storage;

  let isPersistent: boolean | undefined;
  if (typeof storage.persisted === "function") {
    isPersistent = await storage.persisted().catch(() => undefined);
  }

  if (typeof storage.estimate !== "function") {
    return { isPersistent, reason: "storage.estimate unavailable" };
  }

  try {
    const estimate = await storage.estimate();
    const usage = typeof estimate.usage === "number" ? estimate.usage : undefined;
    const quota = typeof estimate.quota === "number" ? estimate.quota : undefined;
    const available =
      typeof usage === "number" && typeof quota === "number" && quota >= usage
        ? quota - usage
        : undefined;
    return {
      usageBytes: usage,
      quotaBytes: quota,
      availableBytes: available,
      isPersistent,
      reason: "ok"
    };
  } catch (error) {
    return {
      isPersistent,
      reason: `storage.estimate threw: ${(error as Error)?.name ?? "Error"}`
    };
  }
}

/**
 * Returns true when there is enough free storage to safely attempt a
 * download of the given artifact. Uses a configurable headroom multiplier
 * so we leave room for vector persistence and IndexedDB churn.
 *
 * When the browser does not expose quota information, we conservatively
 * return TRUE — refusing to ever attempt enhanced search on Safari would
 * be worse than letting the loader fail gracefully and fall back.
 */
export function hasStorageHeadroomFor(
  estimate: StorageQuoteEstimate,
  artifact: EmbeddingArtifactRecord,
  headroomMultiplier = DEFAULT_HEADROOM_MULTIPLIER
): boolean {
  if (typeof estimate.availableBytes !== "number") {
    return true;
  }
  const required = artifact.approximateSizeBytes * Math.max(1, headroomMultiplier);
  return estimate.availableBytes >= required;
}

/**
 * Hint for low-memory environments. Uses the non-standard
 * `performance.memory.jsHeapSizeLimit` when available (Chrome/Edge).
 *
 * We do NOT use this as a hard gate — it is only a signal for downgrading
 * from EmbeddingGemma to MiniLM/deterministic at apply time.
 */
export function isLowMemoryEnvironment(): boolean {
  type PerformanceMemory = {
    jsHeapSizeLimit?: number;
    usedJSHeapSize?: number;
  };
  type PerformanceWithMemory = Performance & { memory?: PerformanceMemory };

  if (typeof performance === "undefined") return false;
  const memory = (performance as PerformanceWithMemory).memory;
  if (!memory || typeof memory.jsHeapSizeLimit !== "number") return false;

  // Heuristic: less than ~512 MB heap headroom is considered low memory.
  // EmbeddingGemma alone needs ~300 MB resident to be usable.
  const limit = memory.jsHeapSizeLimit;
  const used = typeof memory.usedJSHeapSize === "number" ? memory.usedJSHeapSize : 0;
  const headroom = limit - used;
  return headroom < 512 * 1024 * 1024;
}
