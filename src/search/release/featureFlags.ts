/**
 * Phase 22 — Search feature flags.
 *
 * Provides a single source of truth for search subsystem feature gates
 * so new capabilities can be shipped disabled-by-default and toggled
 * without code changes.
 *
 * All flags default to the production-safe value. Tests and dev tools
 * can override via setSearchFeatureFlag().
 *
 * IMPORTANT: flags are runtime-only (localStorage). They do NOT require
 * a schema migration. They NEVER affect persisted data shape.
 */

export type SearchFeatureFlag =
  | "enhanced_search"
  | "progressive_search"
  | "federated_discovery"
  | "personalization"
  | "debug_panel"
  | "pwa_orchestration"
  | "remote_cache_eviction";

export type SearchFeatureFlags = Record<SearchFeatureFlag, boolean>;

const STORAGE_KEY = "ryu.search.feature-flags.v1";

const DEFAULTS: SearchFeatureFlags = {
  enhanced_search: true,
  progressive_search: true,
  federated_discovery: false,
  personalization: true,
  debug_panel: false,
  pwa_orchestration: true,
  remote_cache_eviction: true
};

function loadFlags(): SearchFeatureFlags {
  if (typeof localStorage === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveFlags(flags: SearchFeatureFlags): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch {
    // Quota — non-fatal.
  }
}

let cached: SearchFeatureFlags | null = null;

export function getSearchFeatureFlags(): SearchFeatureFlags {
  if (!cached) cached = loadFlags();
  return cached;
}

export function isSearchFeatureEnabled(flag: SearchFeatureFlag): boolean {
  return getSearchFeatureFlags()[flag] ?? false;
}

export function setSearchFeatureFlag(
  flag: SearchFeatureFlag,
  enabled: boolean
): SearchFeatureFlags {
  const current = getSearchFeatureFlags();
  const next = { ...current, [flag]: enabled };
  cached = next;
  saveFlags(next);
  return next;
}

export function resetSearchFeatureFlags(): SearchFeatureFlags {
  cached = { ...DEFAULTS };
  saveFlags(cached);
  return cached;
}

/** Visible for tests. */
export function _resetCachedFlags(): void {
  cached = null;
}
