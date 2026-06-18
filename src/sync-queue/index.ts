/**
 * Phase 30: Sync queue reliability - barrel exports.
 */

// Types
export type {
  ConflictResolution,
  QueueEngineOptions,
  QueueEntry,
  QueueError,
  QueueEvent,
  QueueExecutor,
  QueueHealth,
  QueueStatus,
  TabLockMessage,
  Tombstone,
} from './types';

// Queue engine
export {
  computeBackoffMs,
  createSyncQueueEngine,
  deriveDedupeKey,
  type SyncQueueEngine,
} from './queue-engine';

// Conflict resolver
export {
  createConflictResolver,
  type ConflictResolver,
  type ConflictResolverOptions,
  type ConflictResult,
  type ManualConflict,
} from './conflict-resolver';

// Tombstone registry
export {
  createTombstoneRegistry,
  type TombstoneRegistry,
  type TombstoneRegistryOptions,
} from './tombstone-registry';

// Multi-tab lock
export {
  createMultiTabLock,
  type MultiTabLock,
  type MultiTabLockOptions,
} from './multi-tab-lock';

// Crash recovery
export {
  hasCrashedEntries,
  recoverCrashedEntries,
  type CrashRecoveryOptions,
  type CrashRecoveryResult,
} from './crash-recovery';

// Queue health
export {
  computeQueueHealth,
  formatQueueHealth,
  isQueueHealthy,
  needsAttention,
} from './queue-health';
