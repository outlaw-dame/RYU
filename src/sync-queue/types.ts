/**
 * Phase 30: Unified sync queue types.
 *
 * Shared type definitions for the sync queue engine, conflict resolver,
 * tombstone registry, multi-tab coordination, crash recovery, and health surface.
 */

/** Status of a queue entry throughout its lifecycle. */
export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** Classification of conflict resolution strategies. */
export type ConflictResolution = 'last-write-wins' | 'merge' | 'manual';

/** Structured error attached to failed queue entries. */
export interface QueueError {
  message: string;
  stage: 'enqueue' | 'processing' | 'conflict' | 'network' | 'storage';
  recoverable: boolean;
  timestamp: string;
}

/** A single entry in the unified sync queue. */
export interface QueueEntry {
  id: string;
  operation: string;
  entityType: string;
  entityId: string;
  payload: string;
  status: QueueStatus;
  attempts: number;
  maxAttempts: number;
  enqueuedAt: string;
  updatedAt: string;
  nextRetryAt?: string;
  error?: QueueError;
  /** Deduplication key derived from operation + entityId */
  dedupeKey: string;
  /** Tab identifier that last claimed this entry */
  claimedBy?: string;
  /** Timestamp of when entry was claimed for processing */
  claimedAt?: string;
}

/** Health snapshot for observability and debugging. */
export interface QueueHealth {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  oldestEntryAt: string | null;
  lastErrorAt: string | null;
  lastSuccessAt: string | null;
  lastError: QueueError | null;
}

/** Configuration options for the queue engine. */
export interface QueueEngineOptions {
  maxAttempts?: number;
  concurrency?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  /** Storage key prefix for persistence */
  storagePrefix?: string;
  /** Executor function called to process entries */
  executor?: QueueExecutor;
  /** Conflict resolution strategy */
  conflictStrategy?: ConflictResolution;
  /** Logger for errors/warnings */
  logger?: Pick<Console, 'error' | 'warn'>;
}

/** Executor function that processes a single queue entry. */
export type QueueExecutor = (entry: QueueEntry) => Promise<void>;

/** Tombstone record for a deleted entity. */
export interface Tombstone {
  entityType: string;
  entityId: string;
  deletedAt: string;
  reason?: string;
}

/** Event emitted by the queue engine for UI reactivity. */
export type QueueEvent =
  | { type: 'enqueued'; entry: QueueEntry }
  | { type: 'processing'; entry: QueueEntry }
  | { type: 'completed'; entry: QueueEntry }
  | { type: 'failed'; entry: QueueEntry }
  | { type: 'deduplicated'; entry: QueueEntry; existingId: string }
  | { type: 'tombstoned'; entityType: string; entityId: string }
  | { type: 'health-updated'; health: QueueHealth };

/** Multi-tab lock message over BroadcastChannel. */
export type TabLockMessage =
  | { type: 'claim'; entryId: string; tabId: string; timestamp: string }
  | { type: 'release'; entryId: string; tabId: string }
  | { type: 'heartbeat'; tabId: string; timestamp: string };
