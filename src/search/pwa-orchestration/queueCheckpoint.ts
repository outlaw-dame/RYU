/**
 * Phase 15 — Embedding queue checkpoint / rehydrate.
 *
 * Persists a snapshot of the embedding job queue to localStorage on
 * lifecycle events that may end the page (visibilitychange→hidden,
 * pagehide, freeze) and rehydrates the queue on startup.
 *
 * Why localStorage? It is the only platform store with synchronous
 * read/write that survives reload AND is shared across tabs. We are
 * persisting at most a few hundred small objects (entityId, providerId,
 * textHash, priority, attempts, timestamps) — well under the 5 MB
 * Chrome / 10 MB Firefox quotas.
 *
 * We DROP rehydrated jobs older than `STALE_AFTER_MS` because the
 * indexed entity may have been deleted or have changed text since the
 * checkpoint. Letting stale jobs run would just embed the wrong data.
 *
 * SECURITY: jobs only carry entity ids and metadata — never user-typed
 * query text or document body content. The checkpoint surface
 * therefore cannot leak private content even if another script on the
 * page has localStorage access.
 */

import type { EmbeddingJob } from "../embedding-jobs/embeddingJobTypes";
import type { EmbeddingJobQueue } from "../embedding-jobs/embeddingJobQueue";

const STORAGE_KEY = "ryu.search.embedding-queue.checkpoint.v1";
const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours

type Checkpoint = {
  version: 1;
  savedAt: number;
  jobs: EmbeddingJob[];
};

function getStorage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

/**
 * Snapshot the current queue contents to localStorage. Idempotent — the
 * key is always overwritten. Excludes user-visible jobs because they
 * are tied to the current page session and replaying them on reload
 * would surface stale results.
 */
export function checkpointEmbeddingQueue(queue: EmbeddingJobQueue): boolean {
  const storage = getStorage();
  if (!storage) return false;

  const persistable = queue
    .snapshot()
    .filter((job) => job.priority !== "user-visible");

  if (persistable.length === 0) {
    // Clear any stale checkpoint so subsequent restores don't see it.
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // Storage may be full or denied; safe to ignore — next save retries.
    }
    return true;
  }

  const checkpoint: Checkpoint = {
    version: 1,
    savedAt: Date.now(),
    jobs: persistable
  };

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(checkpoint));
    return true;
  } catch {
    // Quota or denial. Skipping is fine — work resumes via health-check repair.
    return false;
  }
}

/**
 * Restore checkpointed jobs into a queue. Called once at startup. Drops:
 *   - checkpoints with a different version
 *   - checkpoints older than STALE_AFTER_MS
 *   - jobs with malformed shape
 *   - jobs whose providerId no longer matches anything we know about (caller decides)
 */
export function restoreEmbeddingQueue(queue: EmbeddingJobQueue): {
  restored: number;
  dropped: number;
} {
  const storage = getStorage();
  if (!storage) return { restored: 0, dropped: 0 };

  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { restored: 0, dropped: 0 };
  }
  if (!raw) return { restored: 0, dropped: 0 };

  let parsed: Checkpoint | null = null;
  try {
    parsed = JSON.parse(raw) as Checkpoint;
  } catch {
    // Corrupted checkpoint — drop it.
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    return { restored: 0, dropped: 0 };
  }

  if (
    !parsed ||
    parsed.version !== 1 ||
    typeof parsed.savedAt !== "number" ||
    !Array.isArray(parsed.jobs)
  ) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    return { restored: 0, dropped: 0 };
  }

  if (Date.now() - parsed.savedAt > STALE_AFTER_MS) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    return { restored: 0, dropped: parsed.jobs.length };
  }

  let restored = 0;
  let dropped = 0;

  for (const job of parsed.jobs) {
    if (
      !job ||
      typeof job.id !== "string" ||
      typeof job.entityId !== "string" ||
      typeof job.providerId !== "string" ||
      typeof job.textHash !== "string" ||
      typeof job.dimensions !== "number" ||
      typeof job.priority !== "string" ||
      typeof job.enqueuedAt !== "string"
    ) {
      dropped++;
      continue;
    }

    // Reset attempts so a retry budget that was already exhausted does
    // not immediately drop the rehydrated job. This is intentional — we
    // restored from a possibly-crashed session and the world has moved.
    const enqueueResult = queue.enqueue({
      ...job,
      attempts: 0,
      // Clear nextAttemptAt so the job is immediately ready to run.
      nextAttemptAt: undefined
    });
    if (enqueueResult.added) {
      restored++;
    } else {
      dropped++;
    }
  }

  // We've moved the jobs into the live queue — clear the checkpoint so
  // a subsequent save does not double-restore.
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }

  return { restored, dropped };
}

/** Visible for tests. */
export const _CHECKPOINT_STORAGE_KEY = STORAGE_KEY;
export const _CHECKPOINT_STALE_AFTER_MS = STALE_AFTER_MS;
