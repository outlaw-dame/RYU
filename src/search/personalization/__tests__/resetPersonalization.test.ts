import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the weights module so we can verify resetAdaptiveWeights is called.
const resetAdaptiveWeightsMock = vi.fn();
vi.mock("../../weights", () => ({
  resetAdaptiveWeights: () => resetAdaptiveWeightsMock()
}));

import { resetAllPersonalization } from "../resetPersonalization";
import { _resetCachedPreferences, setPersonalizationPreferences, getPersonalizationPreferences } from "../feedbackPolicy";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.has(key) ? this.store.get(key) as string : null; }
  key(index: number) { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  _resetCachedPreferences();
  resetAdaptiveWeightsMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resetAllPersonalization", () => {
  it("clears feedback events, alpha weights, and preferences", () => {
    // Seed some data.
    localStorage.setItem("ryu.search.feedback.v1", JSON.stringify([{ query: "dune", docId: "x" }]));
    localStorage.setItem("ryu.search.alpha-feedback.v1", JSON.stringify({ semantic: 0.8 }));
    setPersonalizationPreferences({ enabled: false, maxBoostPerDoc: 10 });

    const report = resetAllPersonalization();

    expect(report.clearedFeedbackEvents).toBe(true);
    expect(report.clearedAlphaWeights).toBe(true);
    expect(report.clearedPreferences).toBe(true);
    expect(report.errors).toEqual([]);
    expect(localStorage.getItem("ryu.search.feedback.v1")).toBeNull();
    expect(resetAdaptiveWeightsMock).toHaveBeenCalledTimes(1);
    // Preferences should be reset to defaults.
    expect(getPersonalizationPreferences().enabled).toBe(true);
    expect(getPersonalizationPreferences().maxBoostPerDoc).toBe(3);
  });

  it("never throws even when localStorage operations fail", () => {
    const failing: Storage = {
      length: 0,
      clear() {},
      getItem: () => { throw new Error("denied"); },
      key: () => null,
      removeItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); }
    };
    vi.stubGlobal("localStorage", failing);

    const report = resetAllPersonalization();
    // Should not throw — errors captured in report.
    expect(report.errors.length).toBeGreaterThan(0);
  });
});
