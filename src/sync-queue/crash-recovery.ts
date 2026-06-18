/**
 * Phase 30: Crash recovery.
 *
 * On startup, detects in-flight entries from crashed sessions and resets
 * them to pending with exponential backoff. Handles:
 * - Tab close during processing
 * - Browser crash
 * - IndexedDB transaction failures
 */

import { computeBackoffMs } from './queue-engine';
import type { QueueEntry, QueueError } from './types';

/** Threshold for considering a processing entry as crashed (ms). */
const CRASH_DETECTION_THRESHOLD_MS = 60_000;

export type CrashRecoveryResult = {
  /** Entries that were recovered (reset to pending). */
  recovered: QueueEntry[];
  /** Total entries inspected. */
  inspected: number;
};

export type CrashRecoveryOptions = {
  /** How long an entry can be in 'processing' before it is considered crashed. */
  thresholdMs?: number;
  /** Base backoff for recovered entries. */
  baseBackoffMs?: number;
  /** Maximum backoff for recovered entries. */
  maxBackoffMs?: number;
  logger?: Pick<Console, 'warn'>;
};

/**
 * Detect and recover entries stuck in 'processing' state from crashed sessions.
 *
 * This function is designed to be called once at startup. It mutates the
 * provided entries array in place and returns information about what was recovered.
 */
export function recoverCrashedEntries(
  entries: QueueEntry[],
  options: CrashRecoveryOptions = {}
): CrashRecoveryResult {
  const thresholdMs = options.thresholdMs ?? CRASH_DETECTION_THRESHOLD_MS;
  const baseBackoffMs = options.baseBackoffMs ?? 2000;
  const maxBackoffMs = options.maxBackoffMs ?? 60_000;
  const logger = options.logger;

  const now = Date.now();
  const recovered: QueueEntry[] = [];

  for (const entry of entries) {
    if (entry.status !== 'processing') continue;

    // Check if the entry has been processing for longer than the threshold
    const claimedTime = entry.claimedAt ? Date.parse(entry.claimedAt) : Date.parse(entry.updatedAt);
    const elapsed = now - claimedTime;

    if (elapsed >= thresholdMs) {
      const attempts = entry.attempts + 1;
      const backoff = computeBackoffMs(attempts, baseBackoffMs, maxBackoffMs);
      const nextRetryAt = new Date(now + backoff).toISOString();

      const crashError: QueueError = {
        message: `Entry recovered from crashed session (was processing for ${Math.round(elapsed / 1000)}s)`,
        stage: 'processing',
        recoverable: attempts < entry.maxAttempts,
        timestamp: new Date().toISOString(),
      };

      entry.status = 'pending';
      entry.attempts = attempts;
      entry.nextRetryAt = nextRetryAt;
      entry.error = crashError;
      entry.updatedAt = new Date().toISOString();
      entry.claimedBy = undefined;
      entry.claimedAt = undefined;

      recovered.push(entry);
      logger?.warn(
        `[crash-recovery] Recovered entry ${entry.id} (${entry.operation} on ${entry.entityType}:${entry.entityId}), attempt ${attempts}`
      );
    }
  }

  return { recovered, inspected: entries.length };
}

/**
 * Check if any entries appear to be from a crashed session.
 * Useful for displaying a recovery notification to the user.
 */
export function hasCrashedEntries(
  entries: QueueEntry[],
  thresholdMs = CRASH_DETECTION_THRESHOLD_MS
): boolean {
  const now = Date.now();
  return entries.some((entry) => {
    if (entry.status !== 'processing') return false;
    const claimedTime = entry.claimedAt ? Date.parse(entry.claimedAt) : Date.parse(entry.updatedAt);
    return now - claimedTime >= thresholdMs;
  });
}
