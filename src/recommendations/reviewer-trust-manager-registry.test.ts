import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createManager: vi.fn(),
  subscribe: vi.fn(),
  load: vi.fn(),
  setState: vi.fn(),
  dispose: vi.fn(),
  listener: null as ((snapshot: any) => void) | null
}));

vi.mock("./reviewer-trust-management", () => ({
  createReviewerTrustManager: (...args: unknown[]) => mocks.createManager(...args)
}));

import {
  setSharedReviewerTrustState,
  subscribeReviewerTrustInvalidation,
  subscribeSharedReviewerTrust
} from "./reviewer-trust-manager-registry";

const scope = {
  ownerAccountId: "owner-1",
  instanceOrigin: "https://books.example"
};

function ready(state = "neutral") {
  return {
    reviewerAccountId: "reviewer-1",
    state,
    persistedState: state,
    status: "ready",
    error: null,
    revision: 1
  };
}

afterEach(async () => {
  vi.clearAllMocks();
  mocks.listener = null;
  await Promise.resolve();
});

describe("reviewer trust manager registry", () => {
  it("shares one manager across controls and publishes writes to every subscriber", async () => {
    const subscribers = new Set<(snapshot: any) => void>();
    const snapshot = ready();
    mocks.createManager.mockReturnValue({
      getSnapshot: () => snapshot,
      subscribe: (listener: (value: any) => void) => {
        subscribers.add(listener);
        listener(snapshot);
        return () => subscribers.delete(listener);
      },
      load: mocks.load.mockResolvedValue(snapshot),
      setState: mocks.setState.mockImplementation(async (state: string) => {
        const next = ready(state);
        for (const listener of subscribers) listener(next);
        return next;
      }),
      retry: vi.fn(),
      dispose: mocks.dispose
    });
    const first = vi.fn();
    const second = vi.fn();
    const releaseFirst = subscribeSharedReviewerTrust(scope, "reviewer-1", first);
    const releaseSecond = subscribeSharedReviewerTrust(scope, "reviewer-1", second);

    expect(mocks.createManager).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    await setSharedReviewerTrustState(scope, "reviewer-1", "trusted");
    expect(first).toHaveBeenLastCalledWith(expect.objectContaining({ state: "trusted" }));
    expect(second).toHaveBeenLastCalledWith(expect.objectContaining({ state: "trusted" }));

    releaseFirst();
    releaseSecond();
    await Promise.resolve();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });

  it("does not dispose during a Strict Mode cleanup/setup probe", async () => {
    const snapshot = ready();
    mocks.createManager.mockReturnValue({
      getSnapshot: () => snapshot,
      subscribe: (listener: (value: any) => void) => {
        listener(snapshot);
        return vi.fn();
      },
      load: mocks.load.mockResolvedValue(snapshot),
      setState: mocks.setState,
      retry: vi.fn(),
      dispose: mocks.dispose
    });

    const releaseProbe = subscribeSharedReviewerTrust(scope, "strict-reviewer", vi.fn());
    releaseProbe();
    const releaseReal = subscribeSharedReviewerTrust(scope, "strict-reviewer", vi.fn());
    await Promise.resolve();

    expect(mocks.createManager).toHaveBeenCalledTimes(1);
    expect(mocks.dispose).not.toHaveBeenCalled();
    releaseReal();
    await Promise.resolve();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });

  it("emits one invalidation when the confirmed persisted state changes", async () => {
    const subscribers = new Set<(snapshot: any) => void>();
    const snapshot = ready();
    mocks.createManager.mockReturnValue({
      getSnapshot: () => snapshot,
      subscribe: (listener: (value: any) => void) => {
        subscribers.add(listener);
        listener(snapshot);
        return () => subscribers.delete(listener);
      },
      load: mocks.load.mockResolvedValue(snapshot),
      setState: mocks.setState.mockImplementation(async () => {
        const next = ready("blocked");
        for (const listener of subscribers) listener(next);
        return next;
      }),
      retry: vi.fn(),
      dispose: mocks.dispose
    });
    const invalidated = vi.fn();
    const stopInvalidation = subscribeReviewerTrustInvalidation(invalidated);
    const release = subscribeSharedReviewerTrust(scope, "invalidate-reviewer", vi.fn());

    await setSharedReviewerTrustState(scope, "invalidate-reviewer", "blocked");
    expect(invalidated).toHaveBeenCalledTimes(1);

    stopInvalidation();
    release();
  });
});
