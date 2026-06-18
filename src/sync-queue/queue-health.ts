/**
 * Phase 30: Queue health and debugging surface.
 *
 * Provides a unified health snapshot across all queue entries for
 * observability in the debug/settings panel.
 */

import type { QueueEntry, QueueError, QueueHealth } from './types';

/**
 * Compute a QueueHealth snapshot from an array of entries.
 */
export function computeQueueHealth(entries: QueueEntry[]): QueueHealth {
  let pending = 0;
  let processing = 0;
  let completed = 0;
  let failed = 0;
  let oldestEntryAt: string | null = null;
  let lastErrorAt: string | null = null;
  let lastSuccessAt: string | null = null;
  let lastError: QueueError | null = null;

  for (const entry of entries) {
    switch (entry.status) {
      case 'pending':
        pending++;
        break;
      case 'processing':
        processing++;
        break;
      case 'completed':
        completed++;
        if (!lastSuccessAt || entry.updatedAt > lastSuccessAt) {
          lastSuccessAt = entry.updatedAt;
        }
        break;
      case 'failed':
        failed++;
        if (entry.error) {
          if (!lastErrorAt || entry.error.timestamp > lastErrorAt) {
            lastErrorAt = entry.error.timestamp;
            lastError = entry.error;
          }
        }
        break;
    }

    if (!oldestEntryAt || entry.enqueuedAt < oldestEntryAt) {
      oldestEntryAt = entry.enqueuedAt;
    }
  }

  return {
    pending,
    processing,
    completed,
    failed,
    oldestEntryAt,
    lastErrorAt,
    lastSuccessAt,
    lastError,
  };
}

/**
 * Summarize queue health as a human-readable string for debugging.
 */
export function formatQueueHealth(health: QueueHealth): string {
  const parts: string[] = [];
  parts.push(`Pending: ${health.pending}`);
  parts.push(`Processing: ${health.processing}`);
  parts.push(`Completed: ${health.completed}`);
  parts.push(`Failed: ${health.failed}`);

  if (health.oldestEntryAt) {
    parts.push(`Oldest: ${health.oldestEntryAt}`);
  }
  if (health.lastSuccessAt) {
    parts.push(`Last success: ${health.lastSuccessAt}`);
  }
  if (health.lastError) {
    parts.push(`Last error: ${health.lastError.message} (${health.lastError.stage}, recoverable: ${health.lastError.recoverable})`);
  }

  return parts.join(' | ');
}

/**
 * Determine if the queue is in a healthy state (no stuck or failed entries).
 */
export function isQueueHealthy(health: QueueHealth): boolean {
  return health.failed === 0 && health.processing === 0;
}

/**
 * Determine if the queue needs attention (has failed entries that are recoverable).
 */
export function needsAttention(health: QueueHealth): boolean {
  if (health.failed === 0) return false;
  if (health.lastError && health.lastError.recoverable) return true;
  return health.failed > 0;
}
