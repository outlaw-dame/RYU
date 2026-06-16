/**
 * Scheduled indexer: bridges the embedding job scheduler into the
 * repair/backfill/import indexing paths.
 *
 * Instead of calling indexDocument directly (which blocks on embed()),
 * the scheduled indexer enqueues embedding jobs so that:
 * - Deterministic embeddings still happen inline (fast, no model load)
 * - MiniLM/EmbeddingGemma work routes through the scheduler with
 *   proper concurrency, priority, backoff, and stale write protection
 * - Repair jobs don't displace user-visible jobs in the queue
 *
 * Usage:
 *   import { createScheduledRepairIndexer } from "./scheduledIndexer";
 *   const indexer = createScheduledRepairIndexer(scheduler, queue);
 *   await repairSearchIndexHealth(db, { indexer });
 */

import type { RyuDatabase } from "../../db/client";
import type { SearchDocument } from "../types";
import { getEmbeddingProvider } from "../embedding-provider";
import { indexDocument } from "../vector-index";
import { searchableText } from "../embeddings";
import { hashText } from "../vector-utils";
import type { EmbeddingJob, EmbeddingJobPriority } from "./embeddingJobTypes";
import { embeddingJobKey } from "./embeddingJobTypes";
import type { EmbeddingJobQueue } from "./embeddingJobQueue";
import type { EmbeddingScheduler } from "./embeddingScheduler";

export type ScheduledIndexerOptions = {
  /** Priority class for enqueued jobs. Defaults to "repair". */
  priority?: EmbeddingJobPriority;
  /**
   * If true, deterministic provider embeddings are still executed inline
   * (they're cheap enough to not need scheduling). Defaults to true.
   */
  inlineDeterministic?: boolean;
};

/**
 * Result of creating a scheduled repair indexer.
 * The `indexer` is passed to repairSearchIndexHealth.
 * After repair completes, call `flush()` to drain all enqueued jobs.
 */
export type ScheduledRepairIndexerResult = {
  /** The indexer function to pass to repairSearchIndexHealth({ indexer }). */
  indexer: (doc: SearchDocument, db: RyuDatabase) => Promise<void>;
  /**
   * Drain all enqueued embedding jobs. Must be called after
   * repairSearchIndexHealth resolves to actually process the queue.
   * Without this call, enqueued MiniLM/EmbeddingGemma jobs will never execute.
   */
  flush: () => Promise<void>;
};

/**
 * Create an indexer function compatible with repairSearchIndexHealth's
 * `options.indexer` signature that routes work through the embedding
 * job scheduler instead of calling indexDocument directly.
 *
 * Usage:
 *   const { indexer, flush } = createScheduledRepairIndexer(queue, scheduler);
 *   await repairSearchIndexHealth(db, { indexer });
 *   await flush(); // process all enqueued embedding jobs
 */
export function createScheduledRepairIndexer(
  queue: EmbeddingJobQueue,
  scheduler: EmbeddingScheduler,
  options: ScheduledIndexerOptions = {}
): ScheduledRepairIndexerResult {
  const priority = options.priority ?? "repair";
  const inlineDeterministic = options.inlineDeterministic ?? true;

  const indexer = async (doc: SearchDocument, db: RyuDatabase): Promise<void> => {
    const provider = getEmbeddingProvider();

    // Deterministic provider is fast enough to inline without scheduling overhead.
    if (inlineDeterministic && provider.id.startsWith("deterministic")) {
      await indexDocument(doc, db);
      return;
    }

    // For enhanced providers (MiniLM, EmbeddingGemma), enqueue through scheduler.
    const textHash = hashText(searchableText(doc));
    const job: EmbeddingJob = {
      id: embeddingJobKey(doc.id, provider.id, textHash),
      entityId: doc.id,
      entityType: doc.type,
      textHash,
      providerId: provider.id,
      dimensions: provider.dimensions,
      priority,
      attempts: 0,
      enqueuedAt: new Date().toISOString()
    };

    queue.enqueue(job);
  };

  const flush = async (): Promise<void> => {
    await scheduler.drain();
  };

  return { indexer, flush };
}

/**
 * Create a job executor function that the scheduler calls when processing
 * each embedding job. This resolves the SearchDocument and calls indexDocument.
 *
 * Stale provider check: if the job's providerId no longer matches the
 * currently active provider, the job is skipped — the embedding would be
 * generated for a provider that's no longer in use.
 *
 * The executor must be passed to `createEmbeddingScheduler({ execute: ... })`.
 */
export function createEmbeddingJobExecutor(
  db: RyuDatabase,
  getDocument: (entityId: string, entityType: string) => Promise<SearchDocument | null>
): (job: EmbeddingJob) => Promise<void> {
  return async (job: EmbeddingJob): Promise<void> => {
    // Stale provider check — if the active provider changed since this job
    // was enqueued, executing it would generate embeddings for the wrong model.
    const provider = getEmbeddingProvider();
    if (job.providerId !== provider.id) {
      return;
    }

    const doc = await getDocument(job.entityId, job.entityType);
    if (!doc) {
      // Entity no longer exists — skip silently (orphan cleanup).
      return;
    }
    await indexDocument(doc, db);
  };
}
