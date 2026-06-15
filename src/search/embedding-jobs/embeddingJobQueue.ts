/**
 * Priority queue for embedding jobs with deduplication and backoff.
 *
 * Properties:
 * - Jobs are drained in priority order: user-visible → idle → repair → backfill
 * - Within a priority class, FIFO by enqueueAt
 * - Jobs with future nextAttemptAt are skipped until their time arrives
 * - Duplicate (entityId + providerId + textHash) enqueues collapse to one slot
 *   (the highest-priority enqueue wins)
 * - Bounded by maxSize; when full, the lowest-priority oldest job is evicted
 */

import {
  embeddingJobKey,
  type EmbeddingJob,
  type EmbeddingJobPriority
} from "./embeddingJobTypes";

const PRIORITY_ORDER: EmbeddingJobPriority[] = [
  "user-visible",
  "idle",
  "repair",
  "backfill"
];

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

      // Capacity check: evict the lowest-priority oldest job if at capacity.
      let evicted: EmbeddingJob | undefined;
      if (jobs.size >= maxSize) {
        evicted = findEvictionVictim(jobs);
        if (evicted) {
          const evictKey = embeddingJobKey(evicted.entityId, evicted.providerId, evicted.textHash);
          jobs.delete(evictKey);
        } else {
          // Queue is full and no victim found (shouldn't happen, defensive).
          return { added: false };
        }
      }

      jobs.set(key, job);
      return { added: true, evicted };
    },

    takeNext(now = Date.now()) {
      let chosen: EmbeddingJob | null = null;
      let chosenKey = "";

      for (const priority of PRIORITY_ORDER) {
        let candidate: EmbeddingJob | null = null;
        let candidateKey = "";

        for (const [key, job] of jobs.entries()) {
          if (job.priority !== priority) continue;
          if (job.nextAttemptAt && Date.parse(job.nextAttemptAt) > now) continue;

          if (!candidate || Date.parse(job.enqueuedAt) < Date.parse(candidate.enqueuedAt)) {
            candidate = job;
            candidateKey = key;
          }
        }

        if (candidate) {
          chosen = candidate;
          chosenKey = candidateKey;
          break;
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
