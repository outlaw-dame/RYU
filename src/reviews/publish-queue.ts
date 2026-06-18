/**
 * Phase 29 - Publish queue.
 *
 * Offline write queue for publishing reviews to a remote server.
 * Enqueues publish operations when the app is offline or the network is slow,
 * and processes them when connectivity is available.
 *
 * Actual remote publishing is out of scope for Phase 29 -- this module
 * handles enqueueing, dequeuing, and status tracking only.
 */

import { initializeDatabase } from '../db/client';
import { computeBackoffMs } from '../db/write-queue';
import type { PublishQueueEntry, ReviewVisibility } from './types';
import { canPublishRemotely } from './visibility';

const QUEUE_COLLECTION = 'writequeue';

function generateQueueId(): string {
  return `pub-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

export interface EnqueuePublishInput {
  reviewId: string;
  editionId: string;
  userId: string;
  action: 'create' | 'update' | 'delete';
  visibility: ReviewVisibility;
  payload: Record<string, unknown>;
}

/**
 * Enqueues a review for remote publishing.
 * Only public reviews can be enqueued. Private reviews are rejected.
 */
export async function enqueuePublish(input: EnqueuePublishInput): Promise<PublishQueueEntry | null> {
  if (!canPublishRemotely(input.visibility)) {
    return null;
  }

  const db = await initializeDatabase();
  const now = nowISO();
  const id = generateQueueId();

  const queueDoc = {
    id,
    operation: `review:${input.action}`,
    entityType: 'review',
    entityId: input.reviewId,
    payload: JSON.stringify({ ...input.payload, userId: input.userId }),
    status: 'pending' as const,
    attempts: 0,
    enqueuedAt: now,
    updatedAt: now
  };

  await db[QUEUE_COLLECTION].upsert(queueDoc);

  return {
    id,
    reviewId: input.reviewId,
    editionId: input.editionId,
    userId: input.userId,
    action: input.action,
    payload: queueDoc.payload,
    status: 'pending',
    attempts: 0,
    enqueuedAt: now,
    updatedAt: now,
    error: null
  };
}

/**
 * Returns all pending publish entries for a given user.
 */
export async function getPendingPublishEntries(userId: string): Promise<PublishQueueEntry[]> {
  const db = await initializeDatabase();
  const docs = await db[QUEUE_COLLECTION].find({
    selector: {
      entityType: 'review',
      status: 'pending'
    }
  }).exec();

  return docs.map((doc: any) => {
    const plain = doc.toJSON();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(plain.payload);
    } catch {
      // Keep empty parsed if malformed.
    }

    return {
      id: plain.id,
      reviewId: plain.entityId,
      editionId: (parsed.editionId as string) ?? '',
      userId: (parsed.userId as string) ?? userId,
      action: plain.operation.replace('review:', '') as 'create' | 'update' | 'delete',
      payload: plain.payload,
      status: plain.status,
      attempts: plain.attempts,
      enqueuedAt: plain.enqueuedAt,
      updatedAt: plain.updatedAt,
      error: plain.error ?? null
    };
  }).filter((entry) => entry.userId === userId);
}

/**
 * Marks a queue entry as processing. Used when attempting to send to remote.
 */
export async function markProcessing(entryId: string): Promise<void> {
  const db = await initializeDatabase();
  const doc = await db[QUEUE_COLLECTION].findOne(entryId).exec();
  if (doc) {
    await doc.incrementalPatch({ status: 'processing', updatedAt: nowISO() });
  }
}

/**
 * Marks a queue entry as completed after successful remote publish.
 */
export async function markCompleted(entryId: string): Promise<void> {
  const db = await initializeDatabase();
  const doc = await db[QUEUE_COLLECTION].findOne(entryId).exec();
  if (doc) {
    await doc.incrementalPatch({ status: 'completed', updatedAt: nowISO() });
  }
}

/**
 * Marks a queue entry as failed with exponential backoff.
 */
export async function markFailed(entryId: string, error: string): Promise<void> {
  const db = await initializeDatabase();
  const doc = await db[QUEUE_COLLECTION].findOne(entryId).exec();
  if (doc) {
    const attempts = (doc.attempts ?? 0) + 1;
    await doc.incrementalPatch({
      status: 'failed',
      attempts,
      error,
      updatedAt: nowISO()
    });
  }
}

/**
 * Computes the next retry time for a failed entry.
 */
export function getNextRetryMs(attempts: number): number {
  return computeBackoffMs(attempts);
}

/**
 * Removes a completed or failed entry from the queue.
 */
export async function removeFromQueue(entryId: string): Promise<void> {
  const db = await initializeDatabase();
  const doc = await db[QUEUE_COLLECTION].findOne(entryId).exec();
  if (doc) {
    await doc.remove();
  }
}
