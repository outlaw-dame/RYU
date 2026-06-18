/**
 * Read/unread state for notifications.
 *
 * Persists to localStorage so read state survives page reloads and sessions.
 * Uses a combination of individual read IDs and a "mark all read at" timestamp
 * to efficiently track read state without storing every notification ID forever.
 */

import type { ReadState } from "./types";

const STORAGE_KEY = "ryu.notifications.read-state";
const MAX_READ_IDS = 500;

type SerializedReadState = {
  readIds: string[];
  markAllReadAt: string | null;
};

/**
 * Load persisted read state from localStorage.
 */
export function loadReadState(): ReadState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { readIds: new Set(), markAllReadAt: null };

    const parsed: SerializedReadState = JSON.parse(raw);
    return {
      readIds: new Set(Array.isArray(parsed.readIds) ? parsed.readIds.slice(0, MAX_READ_IDS) : []),
      markAllReadAt: typeof parsed.markAllReadAt === "string" ? parsed.markAllReadAt : null
    };
  } catch {
    return { readIds: new Set(), markAllReadAt: null };
  }
}

/**
 * Persist read state to localStorage.
 */
export function saveReadState(state: ReadState): void {
  try {
    const serialized: SerializedReadState = {
      readIds: Array.from(state.readIds).slice(0, MAX_READ_IDS),
      markAllReadAt: state.markAllReadAt
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // Storage full or unavailable - silently ignore
  }
}

/**
 * Mark a single notification as read.
 */
export function markAsRead(state: ReadState, notificationId: string): ReadState {
  if (state.readIds.has(notificationId)) return state;
  const next = new Set(state.readIds);
  next.add(notificationId);
  // Trim if over limit (remove oldest entries)
  if (next.size > MAX_READ_IDS) {
    const arr = Array.from(next);
    const trimmed = arr.slice(arr.length - MAX_READ_IDS);
    return { readIds: new Set(trimmed), markAllReadAt: state.markAllReadAt };
  }
  return { readIds: next, markAllReadAt: state.markAllReadAt };
}

/**
 * Mark multiple notification IDs as read.
 */
export function markMultipleAsRead(state: ReadState, notificationIds: string[]): ReadState {
  let next = state;
  for (const id of notificationIds) {
    next = markAsRead(next, id);
  }
  return next;
}

/**
 * Mark all notifications as read by setting the markAllReadAt timestamp.
 */
export function markAllAsRead(state: ReadState): ReadState {
  return {
    readIds: new Set(),
    markAllReadAt: new Date().toISOString()
  };
}

/**
 * Check if a notification is read.
 * A notification is considered read if:
 * - Its ID is in the readIds set, OR
 * - Its created_at is before markAllReadAt
 */
export function isNotificationRead(
  state: ReadState,
  notificationId: string,
  createdAt: string
): boolean {
  if (state.readIds.has(notificationId)) return true;
  if (state.markAllReadAt && createdAt <= state.markAllReadAt) return true;
  return false;
}

/**
 * Check if a grouped notification is fully read.
 * All notification IDs in the group must be read.
 */
export function isGroupRead(
  state: ReadState,
  notificationIds: string[],
  latestAt: string,
  getCreatedAt?: (id: string) => string
): boolean {
  // If markAllReadAt covers the entire group, it's read
  if (state.markAllReadAt && latestAt <= state.markAllReadAt) return true;
  // Otherwise check each ID individually (respects markAllReadAt for older items)
  return notificationIds.every((id) => {
    const createdAt = getCreatedAt ? getCreatedAt(id) : latestAt;
    return isNotificationRead(state, id, createdAt);
  });
}
