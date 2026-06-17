import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We need to swap the lifecycle module for a controllable fake so the
// tests can drive visibility/network/readiness transitions without
// fighting the real DOM. Hoisted vi.mock so the import below sees it.
const lifecycleHandlers: { current: Array<(snapshot: unknown) => void> } = { current: [] };
const fakeLifecycle = {
  visibility: "visible",
  network: "online",
  phase: "active",
  readiness: "complete",
  changedAt: new Date(0).toISOString()
};

vi.mock("../lifecycleSignals", () => ({
  startLifecycleSignals: vi.fn(() => () => undefined),
  stopLifecycleSignals: vi.fn(),
  getLifecycleSnapshot: () => ({ ...fakeLifecycle }),
  subscribeLifecycle: (listener: (snapshot: unknown) => void) => {
    lifecycleHandlers.current.push(listener);
    listener({ ...fakeLifecycle });
    return () => {
      const i = lifecycleHandlers.current.indexOf(listener);
      if (i >= 0) lifecycleHandlers.current.splice(i, 1);
    };
  },
  probeLifecycle: () => ({ ...fakeLifecycle })
}));

vi.mock("../pressureSignals", () => ({
  probePressureSignals: vi.fn().mockResolvedValue({
    reducedMotion: false,
    dataSaver: false,
    lowBattery: undefined,
    lowMemory: false,
    storageStrained: null
  }),
  shouldPauseBackgroundWork: vi.fn(() => false)
}));

import { createIndexingOrchestrator } from "../indexingOrchestrator";
import { createEmbeddingJobQueue } from "../../embedding-jobs/embeddingJobQueue";
import { shouldPauseBackgroundWork } from "../pressureSignals";

const mockShouldPause = vi.mocked(shouldPauseBackgroundWork);

function emitLifecycle(patch: Partial<typeof fakeLifecycle>): void {
  Object.assign(fakeLifecycle, patch);
  for (const handler of lifecycleHandlers.current) handler({ ...fakeLifecycle });
}

function makeFakeScheduler() {
  return {
    drain: vi.fn().mockResolvedValue(undefined),
    inFlight: vi.fn(() => 0),
    stop: vi.fn(),
    start: vi.fn(),
    isRunning: vi.fn(() => true)
  };
}

beforeEach(() => {
  Object.assign(fakeLifecycle, {
    visibility: "visible",
    network: "online",
    phase: "active",
    readiness: "complete",
    changedAt: new Date(0).toISOString()
  });
  lifecycleHandlers.current = [];
  mockShouldPause.mockReset().mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("indexingOrchestrator", () => {
  it("allows background work when visible/online/interactive AND leader", async () => {
    const queue = createEmbeddingJobQueue();
    const scheduler = makeFakeScheduler();

    const orchestrator = createIndexingOrchestrator({
      queue,
      scheduler,
      coordinatorOptions: { createChannel: () => null }, // single-tab leader
      skipStartLifecycle: true
    });

    // Allow microtasks/probe to flush.
    await Promise.resolve();
    await Promise.resolve();

    const state = orchestrator.getState();
    expect(state.isLeaderTab).toBe(true);
    expect(state.backgroundAllowed).toBe(true);
    expect(state.userVisibleAllowed).toBe(true);
    orchestrator.stop();
  });

  it("pauses background work when visibility flips to hidden", () => {
    const queue = createEmbeddingJobQueue();
    const scheduler = makeFakeScheduler();
    const orchestrator = createIndexingOrchestrator({
      queue,
      scheduler,
      coordinatorOptions: { createChannel: () => null },
      skipStartLifecycle: true
    });

    emitLifecycle({ visibility: "hidden" });
    const state = orchestrator.getState();
    expect(state.backgroundAllowed).toBe(false);
    expect(scheduler.stop).toHaveBeenCalled();
    orchestrator.stop();
  });

  it("pauses background work when network flips to offline", () => {
    const queue = createEmbeddingJobQueue();
    const scheduler = makeFakeScheduler();
    const orchestrator = createIndexingOrchestrator({
      queue,
      scheduler,
      coordinatorOptions: { createChannel: () => null },
      skipStartLifecycle: true
    });

    emitLifecycle({ network: "offline" });
    expect(orchestrator.getState().backgroundAllowed).toBe(false);
    orchestrator.stop();
  });

  it("does NOT allow background work before document is interactive", () => {
    const queue = createEmbeddingJobQueue();
    const scheduler = makeFakeScheduler();
    Object.assign(fakeLifecycle, { readiness: "loading" });
    const orchestrator = createIndexingOrchestrator({
      queue,
      scheduler,
      coordinatorOptions: { createChannel: () => null },
      skipStartLifecycle: true
    });

    expect(orchestrator.getState().backgroundAllowed).toBe(false);

    emitLifecycle({ readiness: "interactive" });
    expect(orchestrator.getState().backgroundAllowed).toBe(true);
    orchestrator.stop();
  });

  it("blocks background work when shouldPauseBackgroundWork returns true", () => {
    const queue = createEmbeddingJobQueue();
    const scheduler = makeFakeScheduler();
    mockShouldPause.mockReturnValue(true);

    const orchestrator = createIndexingOrchestrator({
      queue,
      scheduler,
      coordinatorOptions: { createChannel: () => null },
      skipStartLifecycle: true,
      pressureProbeIntervalMs: 1_000_000 // never re-probe during test
    });

    expect(orchestrator.getState().backgroundAllowed).toBe(false);
    orchestrator.stop();
  });

  it("user-visible state flag remains true while backgrounded (scheduler is gated on backgroundAllowed)", () => {
    const queue = createEmbeddingJobQueue();
    const scheduler = makeFakeScheduler();
    const orchestrator = createIndexingOrchestrator({
      queue,
      scheduler,
      coordinatorOptions: { createChannel: () => null },
      skipStartLifecycle: true
    });

    emitLifecycle({ visibility: "hidden" });
    const state = orchestrator.getState();
    expect(state.backgroundAllowed).toBe(false);
    // hidden should still surface user-visible as available — the
    // scheduler itself is paused, but consumers can use the flag to
    // decide whether to bypass for an inline lexical-only path.
    expect(state.userVisibleAllowed).toBe(true);
    // Scheduler IS stopped because background work is the only path
    // the priority queue exposes today.
    expect(scheduler.stop).toHaveBeenCalled();
    orchestrator.stop();
  });

  it("frozen phase blocks user-visible work too", () => {
    const queue = createEmbeddingJobQueue();
    const scheduler = makeFakeScheduler();
    const orchestrator = createIndexingOrchestrator({
      queue,
      scheduler,
      coordinatorOptions: { createChannel: () => null },
      skipStartLifecycle: true
    });

    emitLifecycle({ phase: "frozen", visibility: "hidden" });
    expect(orchestrator.getState().userVisibleAllowed).toBe(false);
    orchestrator.stop();
  });

  it("subscribers are notified when the decision changes", () => {
    const queue = createEmbeddingJobQueue();
    const scheduler = makeFakeScheduler();
    const orchestrator = createIndexingOrchestrator({
      queue,
      scheduler,
      coordinatorOptions: { createChannel: () => null },
      skipStartLifecycle: true
    });

    const listener = vi.fn();
    orchestrator.subscribe(listener);
    listener.mockClear();

    emitLifecycle({ visibility: "hidden" });
    expect(listener).toHaveBeenCalled();
    orchestrator.stop();
  });
});
