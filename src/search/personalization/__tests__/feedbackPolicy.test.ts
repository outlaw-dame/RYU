import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetCachedPreferences,
  effectiveSurfaceWeight,
  getPersonalizationPreferences,
  resetPersonalizationPreferences,
  setPersonalizationPreferences
} from "../feedbackPolicy";

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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("feedbackPolicy", () => {
  it("returns sensible defaults when nothing is stored", () => {
    const prefs = getPersonalizationPreferences();
    expect(prefs.enabled).toBe(true);
    expect(prefs.maxStoredEvents).toBe(500);
    expect(prefs.decayHalfLifeDays).toBe(7);
    expect(prefs.maxBoostPerDoc).toBe(3);
    expect(prefs.surfaceWeights.library).toBe(1.2);
  });

  it("persists preferences across calls", () => {
    setPersonalizationPreferences({ enabled: false });
    _resetCachedPreferences();
    expect(getPersonalizationPreferences().enabled).toBe(false);
  });

  it("merges patches without overwriting unrelated fields", () => {
    setPersonalizationPreferences({ maxBoostPerDoc: 5 });
    expect(getPersonalizationPreferences().enabled).toBe(true);
    expect(getPersonalizationPreferences().maxBoostPerDoc).toBe(5);
  });

  it("resetPersonalizationPreferences restores defaults", () => {
    setPersonalizationPreferences({ enabled: false, maxBoostPerDoc: 10 });
    resetPersonalizationPreferences();
    const prefs = getPersonalizationPreferences();
    expect(prefs.enabled).toBe(true);
    expect(prefs.maxBoostPerDoc).toBe(3);
  });

  it("effectiveSurfaceWeight returns 0 when personalization is disabled", () => {
    setPersonalizationPreferences({ enabled: false });
    expect(effectiveSurfaceWeight("library")).toBe(0);
    expect(effectiveSurfaceWeight("global")).toBe(0);
  });

  it("effectiveSurfaceWeight returns the per-surface multiplier when enabled", () => {
    expect(effectiveSurfaceWeight("library")).toBe(1.2);
    expect(effectiveSurfaceWeight("activity")).toBe(0.5);
    expect(effectiveSurfaceWeight("global")).toBe(1.0);
  });

  it("effectiveSurfaceWeight returns 1 for undefined surface", () => {
    expect(effectiveSurfaceWeight(undefined)).toBe(1);
  });

  it("survives corrupted localStorage gracefully", () => {
    localStorage.setItem("ryu.search.personalization.prefs.v1", "not-json");
    _resetCachedPreferences();
    const prefs = getPersonalizationPreferences();
    expect(prefs.enabled).toBe(true);
  });
});
