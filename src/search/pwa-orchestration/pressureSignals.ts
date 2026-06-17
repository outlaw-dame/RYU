/**
 * Phase 15 — Pressure signals.
 *
 * Aggregates the device-side hints the orchestrator uses to throttle
 * background indexing: battery, data-saver, reduced-motion, and the
 * heap/storage probes already provided by Phase 14's storage-quota
 * module.
 *
 * All probes are async-tolerant: missing browser APIs collapse to
 * conservative defaults that ALLOW background work, because refusing to
 * index when we cannot read battery/connection state would break the
 * majority of browsers (Safari has no Battery API, Firefox dropped it).
 */

import { isLowMemoryEnvironment, probeStorageQuota } from "../model-lifecycle/storageQuota";

type NavigatorWithExtras = Navigator & {
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
    type?: string;
  };
  getBattery?: () => Promise<{
    charging: boolean;
    level: number;
  }>;
};

export type PressureSnapshot = {
  /** True when reduced-motion is requested by the OS / user. */
  reducedMotion: boolean;
  /** True when navigator.connection.saveData is set. */
  dataSaver: boolean;
  /** True when battery is below 20% AND not charging. Undefined if unknown. */
  lowBattery: boolean | undefined;
  /** True when JS heap headroom is constrained (Phase 14 heuristic). */
  lowMemory: boolean;
  /**
   * True when the origin storage quota has less than the headroom we
   * require for safe indexing churn. Computed from a recent probe; null
   * if no probe has been performed yet.
   */
  storageStrained: boolean | null;
};

const STORAGE_HEADROOM_BYTES = 100 * 1024 * 1024; // 100 MB safety margin

function readReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function readDataSaver(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as NavigatorWithExtras).connection;
  return Boolean(connection?.saveData);
}

async function readBattery(): Promise<boolean | undefined> {
  if (typeof navigator === "undefined") return undefined;
  const nav = navigator as NavigatorWithExtras;
  if (typeof nav.getBattery !== "function") return undefined;

  try {
    const battery = await nav.getBattery();
    if (typeof battery?.level !== "number" || typeof battery?.charging !== "boolean") {
      return undefined;
    }
    return !battery.charging && battery.level < 0.2;
  } catch {
    return undefined;
  }
}

async function readStorageStrained(): Promise<boolean | null> {
  const estimate = await probeStorageQuota();
  if (typeof estimate.availableBytes !== "number") return null;
  return estimate.availableBytes < STORAGE_HEADROOM_BYTES;
}

/**
 * Probe every pressure source. Always resolves; never throws.
 * Designed to be called periodically by the orchestrator (e.g. every
 * 30 seconds) — keep work cheap and tolerate failure.
 */
export async function probePressureSignals(): Promise<PressureSnapshot> {
  const [lowBattery, storageStrained] = await Promise.all([
    readBattery(),
    readStorageStrained()
  ]);

  return {
    reducedMotion: readReducedMotion(),
    dataSaver: readDataSaver(),
    lowBattery,
    lowMemory: isLowMemoryEnvironment(),
    storageStrained
  };
}

/**
 * Combine pressure signals into a single decision. Returns true when the
 * orchestrator should pause non-essential (idle/repair/backfill) work.
 *
 * User-visible jobs are NEVER blocked by pressure — they are scheduled
 * synchronously in response to user interaction and must complete to
 * keep search responsive. Callers gate background work only.
 */
export function shouldPauseBackgroundWork(snapshot: PressureSnapshot): boolean {
  if (snapshot.lowMemory) return true;
  if (snapshot.dataSaver) return true;
  if (snapshot.lowBattery === true) return true;
  if (snapshot.storageStrained === true) return true;
  return false;
}
