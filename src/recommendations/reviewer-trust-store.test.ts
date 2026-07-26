import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeReviewerTrustContribution,
  getReviewerTrustEntry,
  getReviewerTrustLevel,
  getReviewersByTrust,
  isReviewerExcluded,
  loadReviewerTrust,
  removeReviewerTrust,
  resetAllReviewerTrust,
  setReviewerTrust
} from "./reviewer-trust-store";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.get(key) ?? null; }
  key(index: number) { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, value); }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reviewer-trust-store", () => {
  describe("setReviewerTrust", () => {
    it("creates a new entry when setting trusted", () => {
      setReviewerTrust("rev-1", "trusted", { acct: "alice@books.tld", reason: "Great taste" });
      const entry = getReviewerTrustEntry("rev-1");
      expect(entry).toBeDefined();
      expect(entry!.trustLevel).toBe("trusted");
      expect(entry!.acct).toBe("alice@books.tld");
      expect(entry!.reason).toBe("Great taste");
    });

    it("updates an existing entry", () => {
      setReviewerTrust("rev-1", "trusted");
      setReviewerTrust("rev-1", "low_trust", { reason: "Changed my mind" });
      const entry = getReviewerTrustEntry("rev-1");
      expect(entry!.trustLevel).toBe("low_trust");
      expect(entry!.reason).toBe("Changed my mind");
    });

    it("removes entry when setting to neutral", () => {
      setReviewerTrust("rev-1", "trusted");
      setReviewerTrust("rev-1", "neutral");
      expect(getReviewerTrustEntry("rev-1")).toBeUndefined();
      expect(loadReviewerTrust()).toHaveLength(0);
    });

    it("rejects empty accountId", () => {
      const before = loadReviewerTrust();
      setReviewerTrust("", "trusted");
      expect(loadReviewerTrust()).toEqual(before);
    });

    it("rejects oversized accountId", () => {
      const before = loadReviewerTrust();
      setReviewerTrust("x".repeat(600), "trusted");
      expect(loadReviewerTrust()).toEqual(before);
    });
  });

  describe("removeReviewerTrust", () => {
    it("removes a specific entry", () => {
      setReviewerTrust("rev-1", "trusted");
      setReviewerTrust("rev-2", "low_trust");
      removeReviewerTrust("rev-1");
      expect(loadReviewerTrust()).toHaveLength(1);
      expect(getReviewerTrustLevel("rev-1")).toBe("neutral");
      expect(getReviewerTrustLevel("rev-2")).toBe("low_trust");
    });
  });

  describe("getReviewerTrustLevel", () => {
    it("returns neutral for unknown reviewers", () => {
      expect(getReviewerTrustLevel("unknown")).toBe("neutral");
    });

    it("returns the set level", () => {
      setReviewerTrust("rev-1", "blocked");
      expect(getReviewerTrustLevel("rev-1")).toBe("blocked");
    });
  });

  describe("resetAllReviewerTrust", () => {
    it("clears all entries", () => {
      setReviewerTrust("rev-1", "trusted");
      setReviewerTrust("rev-2", "muted");
      resetAllReviewerTrust();
      expect(loadReviewerTrust()).toHaveLength(0);
    });
  });

  describe("getReviewersByTrust", () => {
    it("filters by trust level", () => {
      setReviewerTrust("rev-1", "trusted");
      setReviewerTrust("rev-2", "trusted");
      setReviewerTrust("rev-3", "low_trust");
      expect(getReviewersByTrust("trusted")).toHaveLength(2);
      expect(getReviewersByTrust("low_trust")).toHaveLength(1);
      expect(getReviewersByTrust("muted")).toHaveLength(0);
    });
  });

  describe("computeReviewerTrustContribution", () => {
    it("returns positive bounded delta for trusted reviewers", () => {
      setReviewerTrust("rev-1", "trusted");
      const result = computeReviewerTrustContribution("rev-1", 1.0);
      expect(result.delta).toBeGreaterThanOrEqual(0.15);
      expect(result.delta).toBeLessThanOrEqual(0.25);
      expect(result.exclude).toBe(false);
    });

    it("returns negative bounded delta for low_trust reviewers", () => {
      setReviewerTrust("rev-1", "low_trust");
      const result = computeReviewerTrustContribution("rev-1", 1.0);
      expect(result.delta).toBeLessThanOrEqual(-0.10);
      expect(result.delta).toBeGreaterThanOrEqual(-0.15);
      expect(result.exclude).toBe(false);
    });

    it("returns zero delta and exclude=true for muted reviewers", () => {
      setReviewerTrust("rev-1", "muted");
      const result = computeReviewerTrustContribution("rev-1");
      expect(result.delta).toBe(0);
      expect(result.exclude).toBe(true);
    });

    it("returns zero delta and exclude=true for blocked reviewers", () => {
      setReviewerTrust("rev-1", "blocked");
      const result = computeReviewerTrustContribution("rev-1");
      expect(result.delta).toBe(0);
      expect(result.exclude).toBe(true);
    });

    it("returns zero delta for neutral/unknown reviewers", () => {
      const result = computeReviewerTrustContribution("unknown");
      expect(result.delta).toBe(0);
      expect(result.exclude).toBe(false);
    });

    it("scales boost by confidence parameter", () => {
      setReviewerTrust("rev-1", "trusted");
      const low = computeReviewerTrustContribution("rev-1", 0.0);
      const high = computeReviewerTrustContribution("rev-1", 1.0);
      expect(low.delta).toBeLessThan(high.delta);
      expect(low.delta).toBeCloseTo(0.15, 5);
      expect(high.delta).toBeCloseTo(0.25, 5);
    });

    it("clamps confidence to [0, 1]", () => {
      setReviewerTrust("rev-1", "trusted");
      const overMax = computeReviewerTrustContribution("rev-1", 5.0);
      const underMin = computeReviewerTrustContribution("rev-1", -2.0);
      expect(overMax.delta).toBeCloseTo(0.25, 5);
      expect(underMin.delta).toBeCloseTo(0.15, 5);
    });
  });

  describe("isReviewerExcluded", () => {
    it("returns true for muted reviewers", () => {
      setReviewerTrust("rev-1", "muted");
      expect(isReviewerExcluded("rev-1")).toBe(true);
    });

    it("returns true for blocked reviewers", () => {
      setReviewerTrust("rev-1", "blocked");
      expect(isReviewerExcluded("rev-1")).toBe(true);
    });

    it("returns false for trusted, low_trust, and neutral", () => {
      setReviewerTrust("rev-1", "trusted");
      setReviewerTrust("rev-2", "low_trust");
      expect(isReviewerExcluded("rev-1")).toBe(false);
      expect(isReviewerExcluded("rev-2")).toBe(false);
      expect(isReviewerExcluded("unknown")).toBe(false);
    });
  });

  describe("persistence", () => {
    it("survives a load/save cycle", () => {
      setReviewerTrust("rev-1", "trusted", { acct: "alice@test.tld" });
      setReviewerTrust("rev-2", "blocked");
      const loaded = loadReviewerTrust();
      expect(loaded).toHaveLength(2);
      expect(loaded.find((e) => e.accountId === "rev-1")?.trustLevel).toBe("trusted");
    });

    it("handles corrupted localStorage gracefully", () => {
      localStorage.setItem("ryu:reviewer-trust", "not json!!!");
      expect(loadReviewerTrust()).toEqual([]);
    });

    it("handles non-array localStorage gracefully", () => {
      localStorage.setItem("ryu:reviewer-trust", '{"not": "array"}');
      expect(loadReviewerTrust()).toEqual([]);
    });
  });
});
