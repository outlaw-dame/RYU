/**
 * Phase 30: Conflict resolution strategies.
 *
 * Handles conflicts when multiple writes target the same entity.
 * Supports last-write-wins, merge, and manual resolution.
 */

import type { ConflictResolution, QueueEntry, QueueError } from './types';

/** Result of a conflict resolution attempt. */
export interface ConflictResult {
  resolved: boolean;
  winner?: QueueEntry;
  merged?: string;
  requiresManual?: boolean;
  error?: QueueError;
}

/** Metadata for manual resolution by the user. */
export interface ManualConflict {
  entryA: QueueEntry;
  entryB: QueueEntry;
  detectedAt: string;
  entityType: string;
  entityId: string;
}

export type ConflictResolverOptions = {
  strategy?: ConflictResolution;
  /** Custom merge function for the 'merge' strategy. */
  mergeFn?: (a: string, b: string) => string;
  logger?: Pick<Console, 'warn'>;
};

export type ConflictResolver = {
  /** Resolve a conflict between two entries targeting the same entity. */
  resolve(existing: QueueEntry, incoming: QueueEntry): ConflictResult;
  /** Get unresolved manual conflicts. */
  getManualConflicts(): ManualConflict[];
  /** Accept a manual resolution for a conflict. */
  resolveManual(entityId: string, winnerId: string): void;
  /** Clear resolved conflicts from history. */
  clearResolved(): void;
};

function nowIso(): string {
  return new Date().toISOString();
}

export function createConflictResolver(options: ConflictResolverOptions = {}): ConflictResolver {
  const strategy = options.strategy ?? 'last-write-wins';
  const mergeFn = options.mergeFn ?? defaultMerge;
  const logger = options.logger;

  const manualConflicts: ManualConflict[] = [];

  function resolve(existing: QueueEntry, incoming: QueueEntry): ConflictResult {
    switch (strategy) {
      case 'last-write-wins':
        return resolveLastWriteWins(existing, incoming);
      case 'merge':
        return resolveMerge(existing, incoming);
      case 'manual':
        return resolveManualStrategy(existing, incoming);
      default:
        return resolveLastWriteWins(existing, incoming);
    }
  }

  function resolveLastWriteWins(existing: QueueEntry, incoming: QueueEntry): ConflictResult {
    // Compare updatedAt timestamps; most recent wins
    const existingTime = Date.parse(existing.updatedAt);
    const incomingTime = Date.parse(incoming.updatedAt);

    const winner = incomingTime >= existingTime ? incoming : existing;
    return { resolved: true, winner };
  }

  function resolveMerge(existing: QueueEntry, incoming: QueueEntry): ConflictResult {
    try {
      const merged = mergeFn(existing.payload, incoming.payload);
      return { resolved: true, merged };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger?.warn(`Merge conflict resolution failed: ${errorMsg}`);
      return {
        resolved: false,
        error: {
          message: `Merge failed: ${errorMsg}`,
          stage: 'conflict',
          recoverable: true,
          timestamp: nowIso(),
        },
      };
    }
  }

  function resolveManualStrategy(existing: QueueEntry, incoming: QueueEntry): ConflictResult {
    const conflict: ManualConflict = {
      entryA: existing,
      entryB: incoming,
      detectedAt: nowIso(),
      entityType: existing.entityType,
      entityId: existing.entityId,
    };
    manualConflicts.push(conflict);
    return { resolved: false, requiresManual: true };
  }

  function getManualConflicts(): ManualConflict[] {
    return [...manualConflicts];
  }

  function resolveManual(entityId: string, winnerId: string): void {
    const index = manualConflicts.findIndex((c) => c.entityId === entityId);
    if (index >= 0) {
      manualConflicts.splice(index, 1);
    }
  }

  function clearResolved(): void {
    manualConflicts.length = 0;
  }

  return { resolve, getManualConflicts, resolveManual, clearResolved };
}

/**
 * Default merge: shallow-merge JSON payloads (incoming fields override existing).
 */
function defaultMerge(existingPayload: string, incomingPayload: string): string {
  const existing = JSON.parse(existingPayload);
  const incoming = JSON.parse(incomingPayload);
  return JSON.stringify({ ...existing, ...incoming });
}
