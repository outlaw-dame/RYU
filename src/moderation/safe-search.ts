/**
 * Phase 35 - Safe search.
 *
 * Controls filtering of sensitive-flagged content.
 * Default: strict (hides sensitive content).
 * User can opt out by lowering the safe search level.
 */

import type { SafeSearchLevel } from "./types";

const STORAGE_KEY = "ryu:safe-search-level";

/** Default safe search level. Hides sensitive content by default. */
export const DEFAULT_SAFE_SEARCH_LEVEL: SafeSearchLevel = "strict";

/**
 * Load the user's safe search preference from localStorage.
 */
export function loadSafeSearchLevel(): SafeSearchLevel {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "strict" || raw === "moderate" || raw === "off") {
      return raw;
    }
    return DEFAULT_SAFE_SEARCH_LEVEL;
  } catch {
    return DEFAULT_SAFE_SEARCH_LEVEL;
  }
}

/**
 * Save the user's safe search preference to localStorage.
 */
export function saveSafeSearchLevel(level: SafeSearchLevel): void {
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch {
    // Storage full or unavailable; silently fail
  }
}

/**
 * Check if a status should be filtered based on safe search settings.
 *
 * @param sensitive - Whether the status is marked as sensitive
 * @param spoilerText - The content warning / spoiler text (empty string means none)
 * @returns true if content should be filtered (hidden/blurred)
 */
export function shouldFilterSensitive(
  sensitive: boolean | undefined,
  spoilerText: string | undefined
): boolean {
  const level = loadSafeSearchLevel();

  switch (level) {
    case "strict":
      // Filter any content marked as sensitive OR with a content warning
      return Boolean(sensitive) || Boolean(spoilerText && spoilerText.length > 0);
    case "moderate":
      // Only filter content explicitly marked sensitive (not just CW)
      return Boolean(sensitive);
    case "off":
      // Never auto-filter
      return false;
  }
}

/**
 * Check if content warnings should be respected (shown as overlays).
 * Content warnings are always respected regardless of safe search level,
 * because they represent author intent, not platform moderation.
 */
export function hasContentWarning(spoilerText: string | undefined): boolean {
  return Boolean(spoilerText && spoilerText.trim().length > 0);
}
