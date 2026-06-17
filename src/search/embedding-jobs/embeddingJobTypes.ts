/**
 * Types for the embedding job scheduler.
 *
 * Embedding work (especially MiniLM/EmbeddingGemma) can be expensive.
 * The scheduler keeps it off the critical UI path by classifying jobs
 * by priority and applying bounded backoff with jitter.
 */

import type { SearchEntityType } from "../types";

/**
 * Priority class for an embedding job. Determines scheduling order
 * and retry budget.
 */
export type EmbeddingJobPriority =
  /** Search result candidates, recently opened or imported items. Drained first. */
  | "user-visible"
  /** Background indexing after import or author dependency fanout. Drained when idle. */
  | "idle"
  /** Missing/stale vectors from health check. Higher retry budget. */
  | "repair"
  /** Large full-library rebuild. Highest retry budget, lowest priority. */
  | "backfill";

/**
 * A single embedding job. Identified by entity + provider + textHash,
 * so duplicate enqueues are deduplicated.
 */
export type EmbeddingJob = {
  id: string;
  entityId: string;
  entityType: SearchEntityType;
  textHash: string;
  providerId: string;
  dimensions: number;
  priority: EmbeddingJobPriority;
  attempts: number;
  enqueuedAt: string;
  /** ISO timestamp; jobs are not picked up until this time. Set by retry/backoff. */
  nextAttemptAt?: string;
};

/**
 * Final outcome of a job execution attempt.
 */
export type EmbeddingJobResult =
  | { kind: "succeeded"; job: EmbeddingJob }
  | { kind: "retry-scheduled"; job: EmbeddingJob; reason: string; nextAttemptAt: string }
  | { kind: "permanently-failed"; job: EmbeddingJob; reason: string }
  | { kind: "stale-dropped"; job: EmbeddingJob; reason: string };

/**
 * Maximum retry attempts per priority class.
 */
export const MAX_ATTEMPTS_BY_PRIORITY: Record<EmbeddingJobPriority, number> = {
  "user-visible": 3,
  "idle": 3,
  "repair": 5,
  "backfill": 5
};

/**
 * Compute the deduplication key for a job. Identical (entity, provider, textHash)
 * pairs always collapse to the same queue slot.
 */
export function embeddingJobKey(
  entityId: string,
  providerId: string,
  textHash: string
): string {
  return `${entityId}::${providerId}::${textHash}`;
}

/**
 * Bounded exponential backoff with jitter.
 * Returns delay in milliseconds. Capped at 30 seconds.
 */
export function nextRetryDelayMs(attempt: number): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const base = Math.min(30_000, 500 * 2 ** safeAttempt);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}
