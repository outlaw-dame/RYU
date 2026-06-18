/**
 * Local notification cache for offline access.
 *
 * Caches up to 200 most recent notifications in localStorage.
 * Notifications are ephemeral UI state - this cache provides offline
 * access but is not a permanent store. Cache is automatically trimmed.
 */

import type { RawNotification } from "./types";

const STORAGE_KEY = "ryu.notifications.cache";
const MAX_CACHED = 200;

type CacheEnvelope = {
  version: 1;
  updatedAt: string;
  notifications: RawNotification[];
};

/**
 * Load cached notifications from localStorage.
 * Returns empty array on parse failure or missing data.
 */
export function loadCachedNotifications(): RawNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const envelope: CacheEnvelope = JSON.parse(raw);
    if (envelope.version !== 1 || !Array.isArray(envelope.notifications)) {
      return [];
    }

    return envelope.notifications.slice(0, MAX_CACHED);
  } catch {
    return [];
  }
}

/**
 * Save notifications to localStorage cache.
 * Merges with existing cache and trims to MAX_CACHED most recent.
 */
export function saveCachedNotifications(notifications: RawNotification[]): void {
  try {
    const existing = loadCachedNotifications();
    const merged = mergeNotifications(existing, notifications);
    const trimmed = merged.slice(0, MAX_CACHED);

    const envelope: CacheEnvelope = {
      version: 1,
      updatedAt: new Date().toISOString(),
      notifications: trimmed
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Storage full or unavailable - silently ignore
  }
}

/**
 * Clear the notification cache.
 */
export function clearNotificationCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Merge two notification arrays, deduplicating by ID.
 * Returns sorted by created_at descending (most recent first).
 */
function mergeNotifications(
  existing: RawNotification[],
  incoming: RawNotification[]
): RawNotification[] {
  const map = new Map<string, RawNotification>();

  // Existing notifications (lower priority)
  for (const n of existing) {
    map.set(n.id, n);
  }

  // Incoming notifications overwrite (higher priority - fresher data)
  for (const n of incoming) {
    map.set(n.id, n);
  }

  const merged = Array.from(map.values());
  merged.sort((a, b) => (a.created_at > b.created_at ? -1 : a.created_at < b.created_at ? 1 : 0));

  return merged;
}
