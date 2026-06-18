/**
 * Phase 30: Centralized tombstone registry.
 *
 * Tracks deleted entities to prevent resurrection across all queues.
 * Before any queue processes an entry, it should check the tombstone registry
 * to verify the target entity has not been deleted.
 */

import type { Tombstone } from './types';

const DEFAULT_STORAGE_KEY = 'ryu:tombstones';

export type TombstoneRegistry = {
  /** Record a tombstone for a deleted entity. */
  add(entityType: string, entityId: string, reason?: string): void;
  /** Check if an entity has been tombstoned. */
  isTombstoned(entityType: string, entityId: string): boolean;
  /** Get the tombstone record for an entity, or undefined. */
  get(entityType: string, entityId: string): Tombstone | undefined;
  /** Remove a tombstone (e.g., if the entity is intentionally re-created). */
  remove(entityType: string, entityId: string): void;
  /** Get all tombstones. */
  all(): Tombstone[];
  /** Prune tombstones older than the given age in milliseconds. */
  prune(maxAgeMs: number): number;
  /** Subscribe to changes. */
  subscribe(listener: () => void): () => void;
};

export type TombstoneRegistryOptions = {
  storageKey?: string;
  logger?: Pick<Console, 'warn'>;
};

function tombstoneKey(entityType: string, entityId: string): string {
  return `${entityType}::${entityId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createTombstoneRegistry(options: TombstoneRegistryOptions = {}): TombstoneRegistry {
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;

  let tombstones: Map<string, Tombstone> = loadTombstones();
  const listeners = new Set<() => void>();

  function loadTombstones(): Map<string, Tombstone> {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return new Map();
      const parsed: Tombstone[] = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Map();
      const map = new Map<string, Tombstone>();
      for (const t of parsed) {
        map.set(tombstoneKey(t.entityType, t.entityId), t);
      }
      return map;
    } catch {
      return new Map();
    }
  }

  function persist(): void {
    try {
      const arr = Array.from(tombstones.values());
      localStorage.setItem(storageKey, JSON.stringify(arr));
    } catch {
      // Storage unavailable - registry continues in-memory
    }
  }

  function notify(): void {
    for (const listener of listeners) {
      try { listener(); } catch { /* ignore */ }
    }
  }

  function add(entityType: string, entityId: string, reason?: string): void {
    const key = tombstoneKey(entityType, entityId);
    const record: Tombstone = {
      entityType,
      entityId,
      deletedAt: nowIso(),
      reason,
    };
    tombstones.set(key, record);
    persist();
    notify();
  }

  function isTombstoned(entityType: string, entityId: string): boolean {
    return tombstones.has(tombstoneKey(entityType, entityId));
  }

  function get(entityType: string, entityId: string): Tombstone | undefined {
    return tombstones.get(tombstoneKey(entityType, entityId));
  }

  function remove(entityType: string, entityId: string): void {
    const key = tombstoneKey(entityType, entityId);
    if (tombstones.delete(key)) {
      persist();
      notify();
    }
  }

  function all(): Tombstone[] {
    return Array.from(tombstones.values());
  }

  function prune(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    let pruned = 0;
    for (const [key, t] of tombstones) {
      if (Date.parse(t.deletedAt) < cutoff) {
        tombstones.delete(key);
        pruned++;
      }
    }
    if (pruned > 0) {
      persist();
      notify();
    }
    return pruned;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  return { add, isTombstoned, get, remove, all, prune, subscribe };
}
