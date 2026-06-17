import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetLifecycleSignalsForTests,
  getLifecycleSnapshot,
  probeLifecycle,
  startLifecycleSignals,
  subscribeLifecycle
} from "../lifecycleSignals";

afterEach(() => {
  _resetLifecycleSignalsForTests();
  vi.unstubAllGlobals();
});

describe("probeLifecycle", () => {
  it("returns conservative defaults when navigator/document are missing", () => {
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("navigator", undefined);
    const snapshot = probeLifecycle();
    expect(snapshot.visibility).toBe("visible");
    expect(snapshot.network).toBe("online");
    expect(snapshot.phase).toBe("active");
    expect(snapshot.readiness).toBe("complete");
  });

  it("reads document.visibilityState and document.readyState when available", () => {
    vi.stubGlobal("document", {
      visibilityState: "hidden",
      readyState: "interactive"
    });
    vi.stubGlobal("navigator", { onLine: false });
    const snapshot = probeLifecycle();
    expect(snapshot.visibility).toBe("hidden");
    expect(snapshot.readiness).toBe("interactive");
    expect(snapshot.network).toBe("offline");
  });
});

describe("subscribeLifecycle", () => {
  it("delivers the initial snapshot to new subscribers", () => {
    const listener = vi.fn();
    subscribeLifecycle(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].visibility).toBe("visible");
  });

  it("notifies subscribers when visibility changes", () => {
    const handlers: Record<string, Array<() => void>> = {};
    const fakeDocument = {
      visibilityState: "visible",
      readyState: "complete",
      addEventListener: (event: string, handler: () => void) => {
        handlers[event] ??= [];
        handlers[event].push(handler);
      },
      removeEventListener: () => undefined
    };
    vi.stubGlobal("document", fakeDocument);
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", {
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    });

    startLifecycleSignals();
    const listener = vi.fn();
    subscribeLifecycle(listener);
    listener.mockClear();

    // Simulate visibility change
    (fakeDocument as { visibilityState: string }).visibilityState = "hidden";
    handlers["visibilitychange"][0]();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].visibility).toBe("hidden");

    // Same-state change is a no-op (cached snapshot stays stable)
    handlers["visibilitychange"][0]();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("subscriber errors do not break the observer", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const goodListener = vi.fn();
      subscribeLifecycle(() => {
        throw new Error("listener crashed");
      });
      subscribeLifecycle(goodListener);
      expect(goodListener).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("startLifecycleSignals", () => {
  it("is idempotent", () => {
    const stop1 = startLifecycleSignals();
    const stop2 = startLifecycleSignals();
    // The second call should return the same teardown function.
    expect(stop1).toBe(stop2);
  });

  it("getLifecycleSnapshot reflects the seeded probe state", () => {
    vi.stubGlobal("document", {
      visibilityState: "hidden",
      readyState: "interactive",
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    });
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", {
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    });
    startLifecycleSignals();
    expect(getLifecycleSnapshot().visibility).toBe("hidden");
    expect(getLifecycleSnapshot().readiness).toBe("interactive");
  });
});
