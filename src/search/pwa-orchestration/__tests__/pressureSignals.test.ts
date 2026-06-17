import { afterEach, describe, expect, it, vi } from "vitest";
import { probePressureSignals, shouldPauseBackgroundWork } from "../pressureSignals";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("probePressureSignals", () => {
  it("returns benign defaults when browser APIs are missing", async () => {
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("performance", undefined);
    vi.stubGlobal("window", undefined);
    const snapshot = await probePressureSignals();
    expect(snapshot.reducedMotion).toBe(false);
    expect(snapshot.dataSaver).toBe(false);
    expect(snapshot.lowBattery).toBeUndefined();
    expect(snapshot.lowMemory).toBe(false);
    expect(snapshot.storageStrained).toBeNull();
  });

  it("reads navigator.connection.saveData", async () => {
    vi.stubGlobal("navigator", {
      connection: { saveData: true },
      storage: undefined
    });
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false })
    });
    const snapshot = await probePressureSignals();
    expect(snapshot.dataSaver).toBe(true);
  });

  it("reads prefers-reduced-motion", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", {
      matchMedia: (query: string) => ({
        matches: query.includes("reduce")
      })
    });
    const snapshot = await probePressureSignals();
    expect(snapshot.reducedMotion).toBe(true);
  });

  it("reports lowBattery true only when not charging AND below 20%", async () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("navigator", {
      getBattery: vi.fn().mockResolvedValue({ charging: false, level: 0.1 })
    });
    let snapshot = await probePressureSignals();
    expect(snapshot.lowBattery).toBe(true);

    vi.stubGlobal("navigator", {
      getBattery: vi.fn().mockResolvedValue({ charging: true, level: 0.05 })
    });
    snapshot = await probePressureSignals();
    expect(snapshot.lowBattery).toBe(false);

    vi.stubGlobal("navigator", {
      getBattery: vi.fn().mockResolvedValue({ charging: false, level: 0.5 })
    });
    snapshot = await probePressureSignals();
    expect(snapshot.lowBattery).toBe(false);
  });

  it("never throws when getBattery rejects", async () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("navigator", {
      getBattery: vi.fn().mockRejectedValue(new Error("denied"))
    });
    const snapshot = await probePressureSignals();
    expect(snapshot.lowBattery).toBeUndefined();
  });
});

describe("shouldPauseBackgroundWork", () => {
  const base = {
    reducedMotion: false,
    dataSaver: false,
    lowBattery: undefined,
    lowMemory: false,
    storageStrained: null
  } as const;

  it("returns false when no pressure is detected", () => {
    expect(shouldPauseBackgroundWork(base)).toBe(false);
  });

  it("pauses on lowMemory", () => {
    expect(shouldPauseBackgroundWork({ ...base, lowMemory: true })).toBe(true);
  });

  it("pauses on dataSaver", () => {
    expect(shouldPauseBackgroundWork({ ...base, dataSaver: true })).toBe(true);
  });

  it("pauses on lowBattery=true; not on undefined (unknown) or false", () => {
    expect(shouldPauseBackgroundWork({ ...base, lowBattery: true })).toBe(true);
    expect(shouldPauseBackgroundWork({ ...base, lowBattery: false })).toBe(false);
    expect(shouldPauseBackgroundWork({ ...base, lowBattery: undefined })).toBe(false);
  });

  it("pauses on storageStrained=true; not on null (unknown) or false", () => {
    expect(shouldPauseBackgroundWork({ ...base, storageStrained: true })).toBe(true);
    expect(shouldPauseBackgroundWork({ ...base, storageStrained: false })).toBe(false);
    expect(shouldPauseBackgroundWork({ ...base, storageStrained: null })).toBe(false);
  });

  it("does NOT pause on reducedMotion alone (it's an a11y signal, not a perf signal)", () => {
    expect(shouldPauseBackgroundWork({ ...base, reducedMotion: true })).toBe(false);
  });
});
