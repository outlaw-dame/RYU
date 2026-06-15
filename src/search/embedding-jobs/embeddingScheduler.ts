/**
 * Embedding job scheduler.
 *
 * Processes jobs from an EmbeddingJobQueue with bounded concurrency.
 * Applies retry/backoff via the queue and respects priority order.
 *
 * Designed to keep embedding work off the critical UI path:
 * - Drains user-visible jobs first
 * - Schedules other priorities during idle time when available
 * - Respects provider generation (delegated to indexDocument internally)
 */

import {
  MAX_ATTEMPTS_BY_PRIORITY,
  nextRetryDelayMs,
  type EmbeddingJob,
  type EmbeddingJobResult
} from "./embeddingJobTypes";
import type { EmbeddingJobQueue } from "./embeddingJobQueue";

export type EmbeddingJobExecutor = (job: EmbeddingJob) => Promise<void>;

export type EmbeddingSchedulerOptions = {
  queue: EmbeddingJobQueue;
  /** Async function that performs the actual embedding for a job. */
  execute: EmbeddingJobExecutor;
  /** Max concurrent in-flight executions. Defaults to 2. */
  concurrency?: number;
  /** Optional callback invoked after each job result for diagnostics. */
  onResult?: (result: EmbeddingJobResult) => void;
  /** Time source for retry scheduling — overridable for tests. */
  now?: () => number;
};

export type EmbeddingScheduler = {
  /** Trigger a draining cycle. Returns when no more ready jobs remain. */
  drain(): Promise<void>;
  /** Number of in-flight jobs currently executing. */
  inFlight(): number;
  /** Stop accepting new work. In-flight jobs continue. */
  stop(): void;
  /** Resume after a stop(). */
  start(): void;
  /** Whether the scheduler is currently accepting work. */
  isRunning(): boolean;
};

export function createEmbeddingScheduler(
  options: EmbeddingSchedulerOptions
): EmbeddingScheduler {
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const now = options.now ?? Date.now;
  let running = true;
  let activeCount = 0;

  async function executeJob(job: EmbeddingJob): Promise<EmbeddingJobResult> {
    try {
      await options.execute(job);
      return { kind: "succeeded", job };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const nextAttempts = job.attempts + 1;
      const maxAttempts = MAX_ATTEMPTS_BY_PRIORITY[job.priority];

      if (nextAttempts >= maxAttempts) {
        return { kind: "permanently-failed", job, reason };
      }

      const delayMs = nextRetryDelayMs(nextAttempts);
      const nextAttemptAt = new Date(now() + delayMs).toISOString();
      const retryJob: EmbeddingJob = {
        ...job,
        attempts: nextAttempts,
        nextAttemptAt
      };

      // Re-enqueue for retry. If queue is full and rejects, treat as permanent.
      const enqueueResult = options.queue.enqueue(retryJob);
      if (!enqueueResult.added) {
        return { kind: "permanently-failed", job, reason: `queue rejected retry: ${reason}` };
      }

      return { kind: "retry-scheduled", job: retryJob, reason, nextAttemptAt };
    }
  }

  async function processSlot(job: EmbeddingJob): Promise<void> {
    activeCount++;
    try {
      const result = await executeJob(job);
      options.onResult?.(result);
    } finally {
      activeCount--;
    }
  }

  async function drain(): Promise<void> {
    if (!running) return;

    const inFlight = new Set<Promise<void>>();

    while (running) {
      // Fill concurrency slots with ready jobs
      while (running && inFlight.size < concurrency) {
        const job = options.queue.takeNext(now());
        if (!job) break;

        const slot = processSlot(job).then(() => {
          inFlight.delete(slot);
        });
        inFlight.add(slot);
      }

      if (inFlight.size === 0) break;

      // Wait for at least one slot to complete, then try to refill
      await Promise.race(inFlight);
    }

    // Wait for any remaining in-flight jobs to settle
    if (inFlight.size > 0) {
      await Promise.allSettled(inFlight);
    }
  }

  return {
    drain,
    inFlight: () => activeCount,
    stop: () => {
      running = false;
    },
    start: () => {
      running = true;
    },
    isRunning: () => running
  };
}
