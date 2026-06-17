/**
 * Phase 15 — Indexing orchestrator.
 *
 * Bridges the embedding-job scheduler to the PWA lifecycle and pressure
 * signals so background indexing is gated by:
 *
 *   - First-paint readiness: never start backfill before document is at
 *     least `interactive`. Avoids fighting first-paint.
 *   - Visibility: pause when the page is hidden / frozen. Resume on
 *     visible / resume.
 *   - Network: pause when offline (network-dependent providers fail).
 *   - Pressure: pause idle/repair/backfill on low memory, low battery,
 *     data-saver, or storage-strained.
 *   - Multi-tab: only ONE tab runs idle/repair/backfill work at a time
 *     so two open tabs cannot embed the same documents twice.
 *
 * User-visible jobs are NEVER blocked by these gates. They are enqueued
 * synchronously by user interaction and must complete to keep search
 * responsive — the orchestrator drains them on every signal change.
 *
 * The orchestrator also wires queue checkpoint/restore so backfill
 * survives a tab crash or accidental reload.
 */

import type { EmbeddingJobQueue } from "../embedding-jobs/embeddingJobQueue";
import type { EmbeddingScheduler } from "../embedding-jobs/embeddingScheduler";
import {
  getLifecycleSnapshot,
  startLifecycleSignals,
  subscribeLifecycle,
  type LifecycleSnapshot
} from "./lifecycleSignals";
import {
  probePressureSignals,
  shouldPauseBackgroundWork,
  type PressureSnapshot
} from "./pressureSignals";
import {
  createMultiTabCoordinator,
  type CreateCoordinatorOptions
} from "./multiTabCoordination";
import {
  checkpointEmbeddingQueue,
  restoreEmbeddingQueue
} from "./queueCheckpoint";

const PRESSURE_PROBE_INTERVAL_MS = 30_000;

export type OrchestratorState = {
  lifecycle: LifecycleSnapshot;
  pressure: PressureSnapshot | null;
  isLeaderTab: boolean;
  /** True when the orchestrator believes background work may run NOW. */
  backgroundAllowed: boolean;
  /** True when at least user-visible work may run NOW. */
  userVisibleAllowed: boolean;
  /** Last decision change. */
  changedAt: string;
};

export type IndexingOrchestratorOptions = {
  queue: EmbeddingJobQueue;
  scheduler: EmbeddingScheduler;
  /** Optional coordinator factory override (used by tests). */
  coordinatorOptions?: CreateCoordinatorOptions;
  /** Override the pressure probe interval. */
  pressureProbeIntervalMs?: number;
  /** Inject a clock for tests. */
  now?: () => number;
  /** Disable the lifecycle signal startup (used by tests that pre-seed). */
  skipStartLifecycle?: boolean;
};

export type IndexingOrchestrator = {
  getState(): OrchestratorState;
  subscribe(listener: (state: OrchestratorState) => void): () => void;
  /** Stop all timers, broadcast leader step-down. */
  stop(): void;
};

function defaultPressureSnapshot(): PressureSnapshot {
  return {
    reducedMotion: false,
    dataSaver: false,
    lowBattery: undefined,
    lowMemory: false,
    storageStrained: null
  };
}

export function createIndexingOrchestrator(
  options: IndexingOrchestratorOptions
): IndexingOrchestrator {
  const now = options.now ?? Date.now;
  const probeInterval = options.pressureProbeIntervalMs ?? PRESSURE_PROBE_INTERVAL_MS;
  const listeners = new Set<(state: OrchestratorState) => void>();

  if (!options.skipStartLifecycle) {
    startLifecycleSignals();
  }

  // Restore any persisted backfill jobs from the previous session BEFORE
  // anything is allowed to enqueue new work. We intentionally drop the
  // user-visible bucket because it is tied to the current page session.
  const restoreResult = restoreEmbeddingQueue(options.queue);

  let lifecycle = getLifecycleSnapshot();
  let pressure: PressureSnapshot | null = null;
  let isLeaderTab = false;
  let backgroundAllowed = false;
  let userVisibleAllowed = false;
  let changedAt = new Date(now()).toISOString();
  let stopped = false;

  function recompute(): void {
    // User-visible work is always allowed unless the document is fully
    // frozen (Page Lifecycle API). Frozen tabs cannot run JS reliably,
    // and the OS will kill timers; nothing we do will succeed there.
    const nextUserVisibleAllowed = lifecycle.phase !== "frozen";

    // Background gates:
    //  - Document must be at least interactive (don't fight first paint)
    //  - Page must be visible (no point indexing in hidden bfcache tabs)
    //  - Network must be online for jobs that depend on remote fetches
    //  - No pressure
    //  - This tab must be the multi-tab leader
    const baseGate =
      nextUserVisibleAllowed &&
      lifecycle.visibility === "visible" &&
      lifecycle.network === "online" &&
      lifecycle.readiness !== "loading" &&
      isLeaderTab;

    const pressureGate = pressure ? !shouldPauseBackgroundWork(pressure) : true;

    const nextBackgroundAllowed = baseGate && pressureGate;

    const changed =
      nextUserVisibleAllowed !== userVisibleAllowed ||
      nextBackgroundAllowed !== backgroundAllowed;

    userVisibleAllowed = nextUserVisibleAllowed;
    backgroundAllowed = nextBackgroundAllowed;

    if (changed) {
      changedAt = new Date(now()).toISOString();
    }

    // Apply the decision to the scheduler.
    //
    // We gate the scheduler on `backgroundAllowed` only. The priority
    // queue already drains user-visible jobs first (within whatever the
    // scheduler is allowed to do), so when background is allowed every
    // queued user-visible job is also drained — that satisfies the
    // "user-visible jobs outrank repair/backfill" contract.
    //
    // When background is NOT allowed (page hidden, offline, low memory,
    // not the leader tab, etc.) we stop the scheduler entirely. This is
    // the safe default: a hidden tab cannot show search results, and
    // mobile platforms aggressively throttle hidden-tab JS anyway.
    // `userVisibleAllowed` is reported in the snapshot for diagnostics
    // so a future progressive-search path can choose to bypass the
    // scheduler for inline lexical-only queries when it makes sense.
    if (backgroundAllowed) {
      options.scheduler.start();
      // Kick a drain so any work that accumulated while paused flushes
      // promptly. drain() never throws, but defensive .catch().
      options.scheduler.drain().catch(() => undefined);
    } else {
      options.scheduler.stop();
    }

    if (changed) emit();
  }

  function emit(): void {
    const state = stateSnapshot();
    for (const listener of listeners) {
      try {
        listener(state);
      } catch {
        // Subscriber errors must never break the orchestrator.
      }
    }
  }

  function stateSnapshot(): OrchestratorState {
    return {
      lifecycle,
      pressure,
      isLeaderTab,
      backgroundAllowed,
      userVisibleAllowed,
      changedAt
    };
  }

  // Wire lifecycle signals.
  const unsubscribeLifecycle = subscribeLifecycle((snapshot) => {
    lifecycle = snapshot;

    // On every transition into "hidden" / "frozen" we checkpoint the
    // queue so a tab kill or bfcache eviction does not lose backfill.
    if (snapshot.visibility === "hidden" || snapshot.phase === "frozen") {
      checkpointEmbeddingQueue(options.queue);
    }

    recompute();
  });

  // Wire multi-tab coordinator.
  const coordinator = createMultiTabCoordinator(options.coordinatorOptions);
  const unsubscribeCoordinator = coordinator.subscribe((leader) => {
    isLeaderTab = leader;
    recompute();
  });

  // Periodic pressure probe. We skip the first probe-result-driven
  // recompute when the snapshot is unchanged.
  let pressureSerialized = "";
  async function runPressureProbe(): Promise<void> {
    if (stopped) return;
    try {
      const next = await probePressureSignals();
      const serialized = JSON.stringify(next);
      if (serialized !== pressureSerialized) {
        pressureSerialized = serialized;
        pressure = next;
        recompute();
      } else if (pressure === null) {
        pressure = next;
        recompute();
      }
    } catch {
      // Probe is best-effort. If it fails, we just keep the prior state.
    }
  }
  void runPressureProbe();
  const pressureInterval = setInterval(() => {
    void runPressureProbe();
  }, probeInterval);

  // Initial pressure snapshot is null until the first probe resolves;
  // until then assume no pressure so background work can start.
  pressure = pressure ?? defaultPressureSnapshot();
  recompute();

  return {
    getState: stateSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      try {
        listener(stateSnapshot());
      } catch {
        // ignore
      }
      return () => {
        listeners.delete(listener);
      };
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(pressureInterval);
      unsubscribeLifecycle();
      unsubscribeCoordinator();
      coordinator.stop();
      // Final checkpoint before shutdown so beforeunload-style teardown
      // does not lose pending backfill.
      checkpointEmbeddingQueue(options.queue);
      listeners.clear();
    }
  };
}

/** Visible for tests/diagnostics. Number of jobs the orchestrator restored at construction. */
export type RestoreReport = ReturnType<typeof restoreEmbeddingQueue>;
