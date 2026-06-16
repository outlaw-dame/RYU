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
 * Create an indexer function compatible with repairSearchIndexHealth's
 * `options.indexer` signature that routes work through the embedding
 * job scheduler instead of calling indexDocument directly.
 *
 * After all repair docs are enqueued, call `scheduler.drain()` to process them.
 */
export function createScheduledRepairIndexer(
  queue: EmbeddingJobQueue,
  scheduler: EmbeddingScheduler,
  options: ScheduledIndexerOptions = {}
): (doc: SearchDocument, db: RyuDatabase) => Promise<void> {
  const priority = options.priority ?? "repair";
  const inlineDeterministic = options.inlineDeterministic ?? true;

  return async (doc: SearchDocument, db: RyuDatabase): Promise<void> => {
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
}

/**
 * Create a job executor function that the scheduler calls when processing
 * each embedding job. This resolves the SearchDocument and calls indexDocument.
 *
 * The executor must be passed to `createEmbeddingScheduler({ execute: ... })`.
 */
export function createEmbeddingJobExecutor(
  db: RyuDatabase,
  getDocument: (entityId: string, entityType: string) => Promise<SearchDocument | null>
): (job: EmbeddingJob) => Promise<void> {
  return async (job: EmbeddingJob): Promise<void> => {
    const doc = await getDocument(job.entityId, job.entityType);
    if (!doc) {
      // Entity no longer exists — skip silently (orphan cleanup).
      return;
    }
    await indexDocument(doc, db);
  };
}
