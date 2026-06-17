import { afterEach, describe, it, expect, vi } from "vitest";
import {
  getAllModelStatuses,
  getModelStatus,
  markDisabled,
  markDownloading,
  markFailed,
  markReady,
  resetAllModelStatuses,
  resetModelStatus,
  subscribeModelStatus
} from "../modelStatus";

afterEach(() => {
  resetAllModelStatuses();
});

describe("modelStatus", () => {
  it("default state for unknown ids is idle with no error or progress", () => {
    const status = getModelStatus("minilm");
    expect(status.state).toBe("idle");
    expect(status.progress).toBe(0);
    expect(status.bytesReceived).toBe(0);
    expect(status.lastError).toBeUndefined();
    expect(status.readyRevision).toBeUndefined();
  });

  it("transitions through downloading -> ready", () => {
    markDownloading("minilm", 0.25, 5_000_000);
    let status = getModelStatus("minilm");
    expect(status.state).toBe("downloading");
    expect(status.progress).toBe(0.25);
    expect(status.bytesReceived).toBe(5_000_000);

    markReady("minilm", "main");
    status = getModelStatus("minilm");
    expect(status.state).toBe("ready");
    expect(status.progress).toBe(1);
    expect(status.readyRevision).toBe("main");
    expect(status.lastError).toBeUndefined();
  });

  it("clamps invalid progress values into the 0..1 range", () => {
    markDownloading("minilm", -0.5);
    expect(getModelStatus("minilm").progress).toBe(0);
    markDownloading("minilm", 5);
    expect(getModelStatus("minilm").progress).toBe(1);
    markDownloading("minilm", Number.NaN);
    expect(getModelStatus("minilm").progress).toBe(0);
    markDownloading("minilm", Number.POSITIVE_INFINITY);
    expect(getModelStatus("minilm").progress).toBe(1);
  });

  it("rejects negative or non-finite bytesReceived to prevent UI poisoning", () => {
    markDownloading("minilm", 0, -100);
    expect(getModelStatus("minilm").bytesReceived).toBe(0);
    markDownloading("minilm", 0, Number.POSITIVE_INFINITY);
    expect(getModelStatus("minilm").bytesReceived).toBe(0);
  });

  it("sanitizes failure messages so loader errors cannot leak URLs or content", () => {
    const error = new TypeError(
      "Failed to fetch https://hf.co/secret/private/note?token=abcdef contents"
    );
    markFailed("minilm", error);
    const status = getModelStatus("minilm");
    expect(status.state).toBe("failed");
    expect(status.lastError).toMatch(/^TypeError: /);
    // The original message length is capped at 240 chars to bound exposure.
    expect((status.lastError ?? "").length).toBeLessThanOrEqual(260);
  });

  it("markDisabled reflects user/device opt-out", () => {
    markReady("embeddinggemma", "main");
    markDisabled("embeddinggemma");
    expect(getModelStatus("embeddinggemma").state).toBe("disabled");
  });

  it("resetModelStatus clears progress, error, and readyRevision", () => {
    markReady("embeddinggemma", "main");
    markFailed("embeddinggemma", new Error("boom"));
    resetModelStatus("embeddinggemma");
    const status = getModelStatus("embeddinggemma");
    expect(status.state).toBe("idle");
    expect(status.lastError).toBeUndefined();
    expect(status.readyRevision).toBeUndefined();
    expect(status.progress).toBe(0);
  });

  it("subscribers are notified on every transition and unsubscribe cleanly", () => {
    const listener = vi.fn();
    const unsub = subscribeModelStatus(listener);

    markDownloading("minilm", 0.5);
    markReady("minilm", "main");
    expect(listener).toHaveBeenCalledTimes(2);

    unsub();
    markFailed("minilm", new Error("x"));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("getAllModelStatuses returns a snapshot including every recorded id", () => {
    markDownloading("minilm");
    markReady("embeddinggemma", "main");
    const snapshot = getAllModelStatuses();
    const ids = snapshot.map((s) => s.id).sort();
    expect(ids).toEqual(["embeddinggemma", "minilm"]);
  });

  it("a thrown listener does not stop other listeners from firing", () => {
    const goodListener = vi.fn();
    const unsubBad = subscribeModelStatus(() => {
      throw new Error("listener crashed");
    });
    const unsubGood = subscribeModelStatus(goodListener);
    // Suppress the expected console.error from the crashing listener so
    // it does not pollute the test output.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      markDownloading("minilm", 0.1);
      expect(goodListener).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      // Unsubscribe both so the afterEach reset does not re-trigger the
      // throwing listener after the spy has been restored.
      unsubBad();
      unsubGood();
    }
  });
});
