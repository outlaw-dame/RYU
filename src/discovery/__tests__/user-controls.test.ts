/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetCachedControls,
  excludeFromDiscovery,
  getDiscoveryControls,
  removeExclusion,
  resetDiscoveryControls,
  setDiscoveryControls
} from "../user-controls";

beforeEach(() => {
  window.localStorage.clear();
  _resetCachedControls();
});

afterEach(() => {
  window.localStorage.clear();
  _resetCachedControls();
});

describe("discovery user controls", () => {
  it("returns defaults when no stored controls exist", () => {
    const controls = getDiscoveryControls();
    expect(controls.enabled).toBe(true);
    expect(controls.excludedIds).toEqual([]);
    expect(controls.federatedEnabled).toBe(false);
  });

  it("persists enabled toggle", () => {
    setDiscoveryControls({ enabled: false });
    _resetCachedControls();
    expect(getDiscoveryControls().enabled).toBe(false);
  });

  it("persists federated toggle", () => {
    setDiscoveryControls({ federatedEnabled: true });
    _resetCachedControls();
    expect(getDiscoveryControls().federatedEnabled).toBe(true);
  });

  it("excludes an entity ID", () => {
    excludeFromDiscovery("book-1");
    expect(getDiscoveryControls().excludedIds).toContain("book-1");
  });

  it("does not duplicate excluded IDs", () => {
    excludeFromDiscovery("book-1");
    excludeFromDiscovery("book-1");
    expect(getDiscoveryControls().excludedIds.filter((id) => id === "book-1")).toHaveLength(1);
  });

  it("removes an exclusion", () => {
    excludeFromDiscovery("book-1");
    excludeFromDiscovery("book-2");
    removeExclusion("book-1");
    const controls = getDiscoveryControls();
    expect(controls.excludedIds).not.toContain("book-1");
    expect(controls.excludedIds).toContain("book-2");
  });

  it("resets all controls to defaults", () => {
    setDiscoveryControls({ enabled: false, federatedEnabled: true });
    excludeFromDiscovery("book-1");
    const after = resetDiscoveryControls();
    expect(after.enabled).toBe(true);
    expect(after.excludedIds).toEqual([]);
    expect(after.federatedEnabled).toBe(false);
  });

  it("handles corrupted localStorage gracefully", () => {
    window.localStorage.setItem("ryu.discovery.controls.v1", "not json");
    _resetCachedControls();
    const controls = getDiscoveryControls();
    expect(controls.enabled).toBe(true);
    expect(controls.excludedIds).toEqual([]);
  });

  it("handles missing fields in stored data", () => {
    window.localStorage.setItem("ryu.discovery.controls.v1", JSON.stringify({ enabled: false }));
    _resetCachedControls();
    const controls = getDiscoveryControls();
    expect(controls.enabled).toBe(false);
    expect(controls.excludedIds).toEqual([]);
    expect(controls.federatedEnabled).toBe(false);
  });
});
