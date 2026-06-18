/**
 * Phase 30: React hook for sync queue health visibility.
 *
 * Provides reactive access to queue health for the debug/settings panel.
 * Uses the engine's referentially stable `health()` method to avoid
 * violating React concurrent rendering rules.
 */

import { useCallback, useSyncExternalStore } from 'react';
import {
  createSyncQueueEngine,
  type QueueHealth,
  type SyncQueueEngine,
} from '../sync-queue';

let sharedEngine: SyncQueueEngine | null = null;

/**
 * Get or create the shared sync queue engine singleton.
 * In production, this will be wired with a real executor.
 */
export function getSyncQueueEngine(): SyncQueueEngine {
  if (!sharedEngine) {
    sharedEngine = createSyncQueueEngine();
  }
  return sharedEngine;
}

/**
 * Allow tests or app initialization to set a custom engine.
 */
export function setSyncQueueEngine(engine: SyncQueueEngine): void {
  sharedEngine = engine;
}

export type UseSyncQueueHealthResult = {
  /** Current health snapshot */
  health: QueueHealth;
  /** Whether the queue is idle (no pending or processing) */
  isIdle: boolean;
  /** Whether there are failed entries needing attention */
  hasFailed: boolean;
  /** Total number of entries in all states */
  totalEntries: number;
  /** Retry a specific failed entry */
  retry: (entryId: string) => void;
  /** Remove a specific entry */
  remove: (entryId: string) => void;
};

export function useSyncQueueHealth(): UseSyncQueueHealthResult {
  const engine = getSyncQueueEngine();

  const health = useSyncExternalStore(
    engine.subscribe,
    engine.health,
    engine.health
  );

  const retry = useCallback((entryId: string) => {
    engine.retry(entryId);
  }, [engine]);

  const remove = useCallback((entryId: string) => {
    engine.remove(entryId);
  }, [engine]);

  const isIdle = health.pending === 0 && health.processing === 0;
  const hasFailed = health.failed > 0;
  const totalEntries = health.pending + health.processing + health.completed + health.failed;

  return { health, isIdle, hasFailed, totalEntries, retry, remove };
}
