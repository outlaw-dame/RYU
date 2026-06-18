/**
 * Phase 35 - Mute store.
 *
 * localStorage-persisted mute list.
 * Muted accounts are hidden from timelines and optionally from notifications.
 * Supports optional duration (auto-expires) and hide-notifications flag.
 */

import type { MuteEntry } from "./types";

const STORAGE_KEY = "ryu:mute-list";

/**
 * Load the mute list from localStorage.
 */
export function loadMuteList(): MuteEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: MuteEntry[] = JSON.parse(raw);
    // Filter out expired mutes
    return parsed.filter((entry) => !isExpired(entry));
  } catch {
    return [];
  }
}

/**
 * Save the mute list to localStorage.
 */
export function saveMuteList(entries: MuteEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or unavailable; silently fail
  }
}

/**
 * Check if a mute entry has expired.
 */
export function isExpired(entry: MuteEntry): boolean {
  if (!entry.expiresAt) return false;
  return Date.now() > Date.parse(entry.expiresAt);
}

/**
 * Add a mute entry. If the account is already muted, merge new options
 * with the existing entry (preserving createdAt and only updating fields
 * that are explicitly provided).
 */
export function addMute(
  accountId: string,
  options: { acct?: string; durationMs?: number; hideNotifications?: boolean } = {}
): MuteEntry[] {
  const list = loadMuteList();
  const existingIndex = list.findIndex((e) => e.accountId === accountId);

  if (existingIndex >= 0) {
    const prev = list[existingIndex];
    list[existingIndex] = {
      ...prev,
      ...(options.acct !== undefined && { acct: options.acct }),
      ...(options.durationMs !== undefined && {
        expiresAt: new Date(Date.now() + options.durationMs).toISOString()
      }),
      ...(options.hideNotifications !== undefined && {
        hideNotifications: options.hideNotifications
      })
    };
  } else {
    const entry: MuteEntry = {
      accountId,
      acct: options.acct,
      createdAt: new Date().toISOString(),
      expiresAt: options.durationMs
        ? new Date(Date.now() + options.durationMs).toISOString()
        : null,
      hideNotifications: options.hideNotifications ?? true
    };
    list.push(entry);
  }

  saveMuteList(list);
  return list;
}

/**
 * Remove a mute entry by account ID.
 */
export function removeMute(accountId: string): MuteEntry[] {
  const list = loadMuteList().filter((e) => e.accountId !== accountId);
  saveMuteList(list);
  return list;
}

/**
 * Check if an account ID is currently muted.
 */
export function isMuted(accountId: string): boolean {
  const list = loadMuteList();
  return list.some((e) => e.accountId === accountId && !isExpired(e));
}

/**
 * Get the mute entry for an account, or undefined if not muted.
 */
export function getMuteEntry(accountId: string): MuteEntry | undefined {
  const list = loadMuteList();
  const entry = list.find((e) => e.accountId === accountId);
  if (entry && isExpired(entry)) return undefined;
  return entry;
}

/**
 * Purge expired mute entries and persist.
 */
export function purgeExpiredMutes(): MuteEntry[] {
  const list = loadMuteList(); // Already filters expired
  saveMuteList(list);
  return list;
}
