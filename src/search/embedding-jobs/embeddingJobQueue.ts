/**
 * Priority queue for embedding jobs with deduplication and backoff.
 *
 * Properties:
 * - Jobs are drained in priority order: user-visible → idle → repair → backfill
 * - Within a priority class, FIFO by enqueueAt
 * - Jobs with future nextAttemptAt are skipped until their time arrives
 * - Duplicate (entityId + providerId + textHash) enqueues collapse to one slot
 *   (the highest-priority enqueue wins)
 * - Bounded by maxSize. When full, the lowest-priority oldest job is evicted
 *   only if the incoming job has equal or higher priority. Otherwise the
 *   incoming job is rejected so background work cannot displace user-visible jobs.
 */

import {
  embeddingJobKey,
  type EmbeddingJob,
  type EmbeddingJobPriority
} from "./embeddingJobTypes";

const PRIORITY_RANK: Record<EmbeddingJobPriority, number> = {
  "user-visible": 0,
  "idle": 1,
  "repair": 2,
  "backfill": 3
};

export type EmbeddingJobQueueOptions = {
  /** Soft cap on queued jobs. Defaults to 500. */
  maxSize?: number;
};

export type EmbeddingJobQueue = {
  enqueue(job: EmbeddingJob): { added: boolean; replaced?: EmbeddingJob; evicted?: EmbeddingJob };
  /** Pop the next job that is ready to run (nextAttemptAt has passed, or unset). */
  takeNext(now?: number): EmbeddingJob | null;
  /** Remove a specific job by its dedup key. */
  remove(key: string): EmbeddingJob | null;
  /** Total queued jobs (including ones not yet ready). */
  size(): number;
  /** Snapshot of all queued jobs for diagnostics. */
  snapshot(): readonly EmbeddingJob[];
  /** Clear the entire queue. */
  clear(): void;
};

/**
 * Create a new in-memory embedding job queue.
 *
 * Each instance is isolated — multiple queues can coexist (e.g. test isolation).
 */
export function createEmbeddingJobQueue(
  options: EmbeddingJobQueueOptions = {}
): EmbeddingJobQueue {
  const maxSize = options.maxSize ?? 500;
  const jobs = new Map<string, EmbeddingJob>();

  return {
    enqueue(job) {
      const key = embeddingJobKey(job.entityId, job.providerId, job.textHash);
      const existing = jobs.get(key);

      if (existing) {
        // Keep the highest-priority version of the duplicate.
        if (PRIORITY_RANK[job.priority] < PRIORITY_RANK[existing.priority]) {
          jobs.set(key, job);
          return { added: true, replaced: existing };
        }
        return { added: false };
      }

      // Capacity check.
      let evicted: EmbeddingJob | undefined;
      if (jobs.size >= maxSize) {
        const victim = findEvictionVictim(jobs);
        if (!victim) {
          // Queue is full and no victim found (shouldn't happen, defensive).
          return { added: false };
        }

        // Refuse to evict a higher-priority job to make room for a lower-priority one.
        // Background/backfill must never displace user-visible work.
        if (PRIORITY_RANK[job.priority] > PRIORITY_RANK[victim.priority]) {
          return { added: false };
        }

        const evictKey = embeddingJobKey(victim.entityId, victim.providerId, victim.textHash);
        jobs.delete(evictKey);
        evicted = victim;
      }

      jobs.set(key, job);
      return { added: true, evicted };
    },

    takeNext(now = Date.now()) {
      // Single-pass scan: track the best candidate by (priority rank, enqueueAt).
      let chosen: EmbeddingJob | null = null;
      let chosenKey = "";
      let chosenRank = Infinity;
      let chosenEnqueuedAt = Infinity;

      for (const [key, job] of jobs.entries()) {
        if (job.nextAttemptAt && Date.parse(job.nextAttemptAt) > now) continue;

        const rank = PRIORITY_RANK[job.priority];
        if (rank > chosenRank) continue;

        const enqueuedAt = Date.parse(job.enqueuedAt);

        if (rank < chosenRank || (rank === chosenRank && enqueuedAt < chosenEnqueuedAt)) {
          chosen = job;
          chosenKey = key;
          chosenRank = rank;
          chosenEnqueuedAt = enqueuedAt;
        }
      }

      if (chosen) {
        jobs.delete(chosenKey);
        return chosen;
      }
      return null;
    },

    remove(key) {
      const existing = jobs.get(key);
      if (!existing) return null;
      jobs.delete(key);
      return existing;
    },

    size() {
      return jobs.size;
    },

    snapshot() {
      return Array.from(jobs.values());
    },

    clear() {
      jobs.clear();
    }
  };
}

/**
 * Find the lowest-priority oldest job for eviction.
 */
function findEvictionVictim(jobs: Map<string, EmbeddingJob>): EmbeddingJob | undefined {
  let victim: EmbeddingJob | undefined;

  for (const job of jobs.values()) {
    if (!victim) {
      victim = job;
      continue;
    }

    const victimRank = PRIORITY_RANK[victim.priority];
    const jobRank = PRIORITY_RANK[job.priority];

    // Higher rank number = lower priority = more evictable
    if (jobRank > victimRank) {
      victim = job;
    } else if (jobRank === victimRank) {
      // Tie-break by oldest enqueueAt
      if (Date.parse(job.enqueuedAt) < Date.parse(victim.enqueuedAt)) {
        victim = job;
      }
    }
  }

  return victim;
}
