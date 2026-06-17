import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetCachedFlags,
  getSearchFeatureFlags,
  isSearchFeatureEnabled,
  resetSearchFeatureFlags,
  setSearchFeatureFlag
} from "../featureFlags";

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
  _resetCachedFlags();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("featureFlags", () => {
  it("returns production-safe defaults", () => {
    const flags = getSearchFeatureFlags();
    expect(flags.enhanced_search).toBe(true);
    expect(flags.progressive_search).toBe(true);
    expect(flags.federated_discovery).toBe(false);
    expect(flags.personalization).toBe(true);
    expect(flags.debug_panel).toBe(false);
    expect(flags.pwa_orchestration).toBe(true);
    expect(flags.remote_cache_eviction).toBe(true);
  });

  it("persists flag changes", () => {
    setSearchFeatureFlag("debug_panel", true);
    _resetCachedFlags();
    expect(isSearchFeatureEnabled("debug_panel")).toBe(true);
  });

  it("resetSearchFeatureFlags restores defaults", () => {
    setSearchFeatureFlag("enhanced_search", false);
    setSearchFeatureFlag("debug_panel", true);
    resetSearchFeatureFlags();
    expect(isSearchFeatureEnabled("enhanced_search")).toBe(true);
    expect(isSearchFeatureEnabled("debug_panel")).toBe(false);
  });

  it("survives corrupted localStorage", () => {
    localStorage.setItem("ryu.search.feature-flags.v1", "not-json");
    _resetCachedFlags();
    expect(isSearchFeatureEnabled("enhanced_search")).toBe(true);
  });

  it("unknown flag keys default to false", () => {
    expect(isSearchFeatureEnabled("nonexistent" as any)).toBe(false);
  });
});
