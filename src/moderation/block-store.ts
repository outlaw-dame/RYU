/**
 * Phase 35 - Block store.
 *
 * localStorage-persisted block list.
 * Blocked accounts are completely hidden from all surfaces:
 * activity, search, notifications, and discovery.
 */

import type { BlockEntry } from "./types";

const STORAGE_KEY = "ryu:block-list";

/**
 * Load the block list from localStorage.
 */
export function loadBlockList(): BlockEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BlockEntry[];
  } catch {
    return [];
  }
}

/**
 * Save the block list to localStorage.
 */
export function saveBlockList(entries: BlockEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or unavailable; silently fail
  }
}

/**
 * Add a block entry. If already blocked, no-op (returns existing list).
 */
export function addBlock(accountId: string, acct?: string): BlockEntry[] {
  const list = loadBlockList();
  const existing = list.find((e) => e.accountId === accountId);

  if (existing) return list;

  const entry: BlockEntry = {
    accountId,
    acct,
    createdAt: new Date().toISOString()
  };

  list.push(entry);
  saveBlockList(list);
  return list;
}

/**
 * Remove a block entry by account ID.
 */
export function removeBlock(accountId: string): BlockEntry[] {
  const list = loadBlockList().filter((e) => e.accountId !== accountId);
  saveBlockList(list);
  return list;
}

/**
 * Check if an account ID is currently blocked.
 */
export function isBlocked(accountId: string): boolean {
  const list = loadBlockList();
  return list.some((e) => e.accountId === accountId);
}

/**
 * Get the block entry for an account, or undefined if not blocked.
 */
export function getBlockEntry(accountId: string): BlockEntry | undefined {
  const list = loadBlockList();
  return list.find((e) => e.accountId === accountId);
}
