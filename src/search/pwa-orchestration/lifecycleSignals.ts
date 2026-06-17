/**
 * Phase 15 — PWA lifecycle signals.
 *
 * One observable surface for the page-lifecycle inputs the indexing
 * orchestrator must react to:
 *
 *   - visibility:    "visible" | "hidden"   (document.visibilityState)
 *   - network:       "online"  | "offline"  (navigator.onLine + events)
 *   - lifecycle:     "active"  | "frozen"   (Page Lifecycle API freeze/resume)
 *   - readiness:     "loading" | "interactive" | "complete"
 *
 * Every probe is SSR-/Safari-tolerant: missing browser APIs collapse to
 * sensible defaults (visible, online, active, complete) so the
 * orchestrator never spuriously pauses indexing in environments that
 * cannot report the real state.
 *
 * Subscribers receive a snapshot on registration and on every change.
 * The internal cache keeps `getSnapshot()` reference-stable between
 * unchanged emissions for `useSyncExternalStore` consumers (we learned
 * this lesson in PR #69).
 */

export type LifecycleVisibility = "visible" | "hidden";
export type LifecycleNetwork = "online" | "offline";
export type LifecyclePhase = "active" | "frozen";
export type LifecycleReadiness = "loading" | "interactive" | "complete";

export type LifecycleSnapshot = {
  visibility: LifecycleVisibility;
  network: LifecycleNetwork;
  phase: LifecyclePhase;
  readiness: LifecycleReadiness;
  /** Last transition timestamp (ISO). Useful for orchestrator rate limiting. */
  changedAt: string;
};

type Listener = (snapshot: LifecycleSnapshot) => void;

function defaultSnapshot(): LifecycleSnapshot {
  return {
    visibility: "visible",
    network: "online",
    phase: "active",
    readiness: "complete",
    changedAt: new Date(0).toISOString()
  };
}

let snapshot: LifecycleSnapshot = defaultSnapshot();
const listeners = new Set<Listener>();
let started = false;
let cleanups: Array<() => void> = [];

function emit(): void {
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      // A misbehaving subscriber must never break the lifecycle observer
      // because that would break indexing pause/resume.
      // eslint-disable-next-line no-console
      console.error("lifecycle listener threw", error);
    }
  }
}

function update(patch: Partial<LifecycleSnapshot>): void {
  // Drop no-op updates so cached snapshots stay reference-stable.
  let changed = false;
  for (const key of Object.keys(patch) as Array<keyof LifecycleSnapshot>) {
    if (patch[key] !== undefined && snapshot[key] !== patch[key]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;

  snapshot = {
    ...snapshot,
    ...patch,
    changedAt: new Date().toISOString()
  };
  emit();
}

function safeOn<E extends string>(
  target: { addEventListener?: (event: E, listener: () => void) => void; removeEventListener?: (event: E, listener: () => void) => void } | undefined,
  event: E,
  handler: () => void
): void {
  if (!target || typeof target.addEventListener !== "function") return;
  target.addEventListener(event, handler);
  cleanups.push(() => {
    target.removeEventListener?.(event, handler);
  });
}

/**
 * Compute an immediate snapshot from the platform APIs without subscribing.
 * Safe to call before `startLifecycleSignals()` — used to seed the
 * orchestrator before any user interaction has happened.
 */
export function probeLifecycle(): LifecycleSnapshot {
  const visibility: LifecycleVisibility =
    typeof document !== "undefined" && document.visibilityState === "hidden"
      ? "hidden"
      : "visible";

  const network: LifecycleNetwork =
    typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "online";

  const readiness: LifecycleReadiness =
    typeof document === "undefined"
      ? "complete"
      : document.readyState === "loading"
        ? "loading"
        : document.readyState === "interactive"
          ? "interactive"
          : "complete";

  return {
    visibility,
    network,
    // The Page Lifecycle freeze/resume API does not expose a "current
    // phase" property. We assume "active" until a freeze event fires.
    phase: "active",
    readiness,
    changedAt: new Date().toISOString()
  };
}

export function getLifecycleSnapshot(): LifecycleSnapshot {
  return snapshot;
}

export function subscribeLifecycle(listener: Listener): () => void {
  listeners.add(listener);
  // Deliver the current state to the new subscriber so they don't have
  // to wait for the next transition before they can make a decision.
  try {
    listener(snapshot);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("lifecycle initial-listener threw", error);
  }
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Wire the snapshot to the platform APIs. Call once at app startup
 * (typically from `runtime-configure.ts` or `App.tsx`). Idempotent —
 * a repeat call with the existing wiring is a no-op.
 *
 * Returns a teardown function for tests / hot-reload.
 */
export function startLifecycleSignals(): () => void {
  if (started) {
    return stopLifecycleSignals;
  }
  started = true;
  cleanups = [];

  // Seed the snapshot from a fresh probe before installing listeners
  // so consumers see the real state immediately.
  snapshot = probeLifecycle();

  if (typeof document !== "undefined") {
    safeOn(document, "visibilitychange", () => {
      update({
        visibility: document.visibilityState === "hidden" ? "hidden" : "visible"
      });
    });
    safeOn(document, "readystatechange", () => {
      update({
        readiness:
          document.readyState === "loading"
            ? "loading"
            : document.readyState === "interactive"
              ? "interactive"
              : "complete"
      });
    });
  }

  if (typeof window !== "undefined") {
    safeOn(window, "online", () => update({ network: "online" }));
    safeOn(window, "offline", () => update({ network: "offline" }));
    // Page Lifecycle API events. These fire on supported browsers
    // (Chrome/Edge) and are no-ops elsewhere.
    safeOn(window, "freeze", () => update({ phase: "frozen", visibility: "hidden" }));
    safeOn(window, "resume", () => update({
      phase: "active",
      // Restore visibility from the live document state so the orchestrator
      // resumes indexing immediately instead of waiting for a separate
      // visibilitychange event (which may not fire after bfcache restore).
      visibility: typeof document !== "undefined" && document.visibilityState === "hidden"
        ? "hidden"
        : "visible"
    }));
    // pagehide / pageshow are universally supported and cover Safari
    // bfcache transitions where freeze/resume are not fired.
    safeOn(window, "pagehide", () => update({ phase: "frozen", visibility: "hidden" }));
    safeOn(window, "pageshow", () => update({
      phase: "active",
      visibility: typeof document !== "undefined" && document.visibilityState === "hidden"
        ? "hidden"
        : "visible"
    }));
  }

  return stopLifecycleSignals;
}

export function stopLifecycleSignals(): void {
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch {
      // Tear-down errors are non-fatal.
    }
  }
  cleanups = [];
  started = false;
}

/** Visible for tests. Resets snapshot, listeners, and started flag. */
export function _resetLifecycleSignalsForTests(): void {
  stopLifecycleSignals();
  listeners.clear();
  snapshot = defaultSnapshot();
}
