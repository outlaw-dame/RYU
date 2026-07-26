import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addSignal,
  getActiveSignalsByKind,
  getActiveSignalsForEntity,
  getEffectiveSignal,
  getSignalCounts,
  isEntitySuppressed,
  loadSignals,
  purgeExpiredSignals,
  removeSignal,
  removeSignalsForEntity,
  resetAllSignals,
  resetInferredSignals
} from "./signal-store";
import { buildSignalId } from "./signal-types";

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

describe("signal-store", () => {
  describe("addSignal", () => {
    it("creates a signal with correct ID format", () => {
      addSignal({ entityType: "author", entityId: "auth-1", kind: "show_more" });
      const signals = loadSignals();
      expect(signals).toHaveLength(1);
      expect(signals[0].id).toBe("signal:author:auth-1:show_more:user_explicit");
      expect(signals[0].strength).toBe(1.0);
      expect(signals[0].provenance).toBe("user_explicit");
    });

    it("clamps strength to [0, 1]", () => {
      addSignal({ entityType: "work", entityId: "w-1", kind: "prefer", strength: 5.0 });
      addSignal({ entityType: "work", entityId: "w-2", kind: "show_less", strength: -2.0 });
      const signals = loadSignals();
      expect(signals[0].strength).toBe(1.0);
      expect(signals[1].strength).toBe(0.0);
    });

    it("updates existing signal with same ID", () => {
      addSignal({ entityType: "author", entityId: "auth-1", kind: "show_more", strength: 0.5 });
      addSignal({ entityType: "author", entityId: "auth-1", kind: "show_more", strength: 0.9 });
      const signals = loadSignals();
      expect(signals).toHaveLength(1);
      expect(signals[0].strength).toBe(0.9);
    });

    it("sets expiry from durationMs", () => {
      const before = Date.now();
      addSignal({ entityType: "genre", entityId: "fantasy", kind: "show_less", durationMs: 60_000 });
      const signals = loadSignals();
      const expiresAt = Date.parse(signals[0].expiresAt!);
      expect(expiresAt).toBeGreaterThanOrEqual(before + 59_000);
      expect(expiresAt).toBeLessThanOrEqual(before + 61_000);
    });

    it("rejects invalid entityType", () => {
      const before = loadSignals();
      addSignal({ entityType: "invalid" as any, entityId: "x", kind: "show_more" });
      expect(loadSignals()).toEqual(before);
    });

    it("rejects empty entityId", () => {
      const before = loadSignals();
      addSignal({ entityType: "author", entityId: "", kind: "show_more" });
      expect(loadSignals()).toEqual(before);
    });

    it("rejects oversized entityId", () => {
      const before = loadSignals();
      addSignal({ entityType: "author", entityId: "x".repeat(1100), kind: "show_more" });
      expect(loadSignals()).toEqual(before);
    });

    it("allows different provenance for same entity+kind", () => {
      addSignal({ entityType: "author", entityId: "auth-1", kind: "show_more", provenance: "user_explicit" });
      addSignal({ entityType: "author", entityId: "auth-1", kind: "show_more", provenance: "local_inference", strength: 0.3 });
      const signals = loadSignals();
      expect(signals).toHaveLength(2);
    });
  });

  describe("removeSignal", () => {
    it("removes by ID", () => {
      addSignal({ entityType: "author", entityId: "auth-1", kind: "show_more" });
      const id = buildSignalId("author", "auth-1", "show_more", "user_explicit");
      removeSignal(id);
      expect(loadSignals()).toHaveLength(0);
    });
  });

  describe("removeSignalsForEntity", () => {
    it("removes all signals for an entity", () => {
      addSignal({ entityType: "author", entityId: "auth-1", kind: "show_more" });
      addSignal({ entityType: "author", entityId: "auth-1", kind: "prefer" });
      addSignal({ entityType: "work", entityId: "w-1", kind: "show_less" });
      removeSignalsForEntity("author", "auth-1");
      expect(loadSignals()).toHaveLength(1);
      expect(loadSignals()[0].entityType).toBe("work");
    });
  });

  describe("getEffectiveSignal", () => {
    it("returns explicit over inferred for same entity+kind", () => {
      addSignal({ entityType: "author", entityId: "auth-1", kind: "show_more", provenance: "local_inference", strength: 0.3 });
      addSignal({ entityType: "author", entityId: "auth-1", kind: "show_more", provenance: "user_explicit", strength: 0.9 });
      const effective = getEffectiveSignal("author", "auth-1", "show_more");
      expect(effective!.provenance).toBe("user_explicit");
      expect(effective!.strength).toBe(0.9);
    });

    it("returns imported over inferred", () => {
      addSignal({ entityType: "genre", entityId: "sci-fi", kind: "prefer", provenance: "local_inference" });
      addSignal({ entityType: "genre", entityId: "sci-fi", kind: "prefer", provenance: "imported" });
      const effective = getEffectiveSignal("genre", "sci-fi", "prefer");
      expect(effective!.provenance).toBe("imported");
    });

    it("returns undefined when no signal exists", () => {
      expect(getEffectiveSignal("author", "unknown", "show_more")).toBeUndefined();
    });
  });

  describe("isEntitySuppressed", () => {
    it("returns true for suppress signal", () => {
      addSignal({ entityType: "author", entityId: "auth-bad", kind: "suppress" });
      expect(isEntitySuppressed("author", "auth-bad")).toBe(true);
    });

    it("returns true for not_interested signal", () => {
      addSignal({ entityType: "work", entityId: "w-boring", kind: "not_interested" });
      expect(isEntitySuppressed("work", "w-boring")).toBe(true);
    });

    it("returns false for show_less (reduction, not exclusion)", () => {
      addSignal({ entityType: "genre", entityId: "romance", kind: "show_less" });
      expect(isEntitySuppressed("genre", "romance")).toBe(false);
    });
  });

  describe("expiry", () => {
    it("expired signals are not active", () => {
      // Add signal that expired 1 second ago
      const signals = loadSignals();
      signals.push({
        id: "signal:author:old:show_more:user_explicit",
        entityType: "author",
        entityId: "old",
        kind: "show_more",
        strength: 1.0,
        provenance: "user_explicit",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z"
      });
      localStorage.setItem("ryu:recommendation-signals", JSON.stringify(signals));

      const active = getActiveSignalsForEntity("author", "old");
      expect(active).toHaveLength(0);
    });

    it("purgeExpiredSignals removes expired entries", () => {
      addSignal({ entityType: "author", entityId: "auth-1", kind: "show_more" });
      // Manually add an expired signal
      const all = loadSignals();
      all.push({
        id: "signal:work:w-old:show_less:local_inference",
        entityType: "work",
        entityId: "w-old",
        kind: "show_less",
        strength: 0.5,
        provenance: "local_inference",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z"
      });
      localStorage.setItem("ryu:recommendation-signals", JSON.stringify(all));

      purgeExpiredSignals();
      expect(loadSignals()).toHaveLength(1);
      expect(loadSignals()[0].entityId).toBe("auth-1");
    });
  });

  describe("resetInferredSignals", () => {
    it("removes only inferred signals, keeps explicit", () => {
      addSignal({ entityType: "author", entityId: "auth-1", kind: "show_more", provenance: "user_explicit" });
      addSignal({ entityType: "author", entityId: "auth-2", kind: "show_more", provenance: "local_inference" });
      addSignal({ entityType: "genre", entityId: "fantasy", kind: "prefer", provenance: "imported" });
      resetInferredSignals();
      const remaining = loadSignals();
      expect(remaining).toHaveLength(2);
      expect(remaining.every((s) => s.provenance !== "local_inference")).toBe(true);
    });
  });

  describe("resetAllSignals", () => {
    it("removes everything", () => {
      addSignal({ entityType: "author", entityId: "auth-1", kind: "show_more" });
      addSignal({ entityType: "work", entityId: "w-1", kind: "prefer" });
      resetAllSignals();
      expect(loadSignals()).toHaveLength(0);
    });
  });

  describe("getSignalCounts", () => {
    it("returns counts by kind for active signals only", () => {
      addSignal({ entityType: "author", entityId: "a1", kind: "show_more" });
      addSignal({ entityType: "author", entityId: "a2", kind: "show_more" });
      addSignal({ entityType: "genre", entityId: "g1", kind: "suppress" });
      const counts = getSignalCounts();
      expect(counts.show_more).toBe(2);
      expect(counts.suppress).toBe(1);
    });
  });

  describe("persistence", () => {
    it("handles corrupted localStorage gracefully", () => {
      localStorage.setItem("ryu:recommendation-signals", "corrupted!!!");
      expect(loadSignals()).toEqual([]);
    });

    it("handles non-array localStorage gracefully", () => {
      localStorage.setItem("ryu:recommendation-signals", '{"not":"array"}');
      expect(loadSignals()).toEqual([]);
    });
  });
});
