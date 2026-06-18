/**
 * Phase 34 - User controls for discovery.
 *
 * localStorage-persisted controls that let users:
 * - Enable/disable recommendations
 * - Exclude specific items
 * - Reset personalization
 * - Enable/disable federated discovery
 *
 * PRIVACY CONTRACT:
 * - Controls are stored ONLY in localStorage on this device.
 * - No data crosses device/account boundary.
 * - Reset wipes all discovery preferences immediately.
 */

import type { DiscoveryControls } from "./types";

const STORAGE_KEY = "ryu.discovery.controls.v1";

function getDefaultControls(): DiscoveryControls {
  return {
    enabled: true,
    excludedIds: [],
    federatedEnabled: false
  };
}

function loadControls(): DiscoveryControls {
  if (typeof localStorage === "undefined") return getDefaultControls();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultControls();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return getDefaultControls();
    }
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : true,
      excludedIds: Array.isArray(parsed.excludedIds) ? parsed.excludedIds : [],
      federatedEnabled: typeof parsed.federatedEnabled === "boolean"
        ? parsed.federatedEnabled
        : false
    };
  } catch {
    return getDefaultControls();
  }
}

function saveControls(controls: DiscoveryControls): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(controls));
  } catch {
    // Quota error - non-fatal.
  }
}

let cachedControls: DiscoveryControls | null = null;

/**
 * Get the current discovery controls.
 */
export function getDiscoveryControls(): DiscoveryControls {
  if (!cachedControls) {
    cachedControls = loadControls();
  }
  return cachedControls;
}

/**
 * Update discovery controls with a partial patch.
 */
export function setDiscoveryControls(
  patch: Partial<DiscoveryControls>
): DiscoveryControls {
  const current = getDiscoveryControls();
  const next: DiscoveryControls = {
    ...current,
    ...patch,
    excludedIds: patch.excludedIds !== undefined
      ? patch.excludedIds
      : current.excludedIds
  };
  cachedControls = next;
  saveControls(next);
  return next;
}

/**
 * Add an entity ID to the exclusion list.
 */
export function excludeFromDiscovery(entityId: string): DiscoveryControls {
  const current = getDiscoveryControls();
  if (current.excludedIds.includes(entityId)) return current;
  return setDiscoveryControls({
    excludedIds: [...current.excludedIds, entityId]
  });
}

/**
 * Remove an entity ID from the exclusion list.
 */
export function removeExclusion(entityId: string): DiscoveryControls {
  const current = getDiscoveryControls();
  return setDiscoveryControls({
    excludedIds: current.excludedIds.filter((id) => id !== entityId)
  });
}

/**
 * Reset all discovery controls and preferences to defaults.
 * Wipes excluded items and re-enables recommendations.
 */
export function resetDiscoveryControls(): DiscoveryControls {
  cachedControls = getDefaultControls();
  saveControls(cachedControls);
  return cachedControls;
}

/** Visible for tests. */
export function _resetCachedControls(): void {
  cachedControls = null;
}
