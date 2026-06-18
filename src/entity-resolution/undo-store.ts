/**
 * Phase 27: Undo store for merge operations.
 *
 * Stores undo snapshots in localStorage for lightweight persistence
 * across sessions. Supports reverting a merge by restoring the
 * original entity and cleaning up resolution records.
 */

import type { UndoSnapshot } from './types';

const UNDO_STORE_KEY = 'ryu:entity-merge-undo-history';
const MAX_UNDO_ENTRIES = 50;

/**
 * Get all undo snapshots from storage.
 */
export function getUndoSnapshots(): UndoSnapshot[] {
  try {
    const raw = localStorage.getItem(UNDO_STORE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as UndoSnapshot[];
  } catch {
    return [];
  }
}

/**
 * Save an undo snapshot after a successful merge.
 */
export function saveUndoSnapshot(snapshot: UndoSnapshot): void {
  const existing = getUndoSnapshots();
  existing.unshift(snapshot);

  // Keep only the most recent entries
  const trimmed = existing.slice(0, MAX_UNDO_ENTRIES);

  try {
    localStorage.setItem(UNDO_STORE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full or unavailable; best-effort only
  }
}

/**
 * Get a specific undo snapshot by ID.
 */
export function getUndoSnapshotById(id: string): UndoSnapshot | undefined {
  return getUndoSnapshots().find((s) => s.id === id);
}

/**
 * Remove a snapshot after a successful undo.
 */
export function removeUndoSnapshot(id: string): void {
  const existing = getUndoSnapshots();
  const filtered = existing.filter((s) => s.id !== id);

  try {
    localStorage.setItem(UNDO_STORE_KEY, JSON.stringify(filtered));
  } catch {
    // best-effort
  }
}

/**
 * Clear all undo history.
 */
export function clearUndoHistory(): void {
  try {
    localStorage.removeItem(UNDO_STORE_KEY);
  } catch {
    // best-effort
  }
}

/**
 * Get the count of available undo operations.
 */
export function getUndoCount(): number {
  return getUndoSnapshots().length;
}
