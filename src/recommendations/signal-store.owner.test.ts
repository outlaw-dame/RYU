import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addSignal, loadSignals } from "./signal-store";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

beforeEach(() => vi.stubGlobal("localStorage", new MemoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe("owner-scoped recommendation signals", () => {
  it("does not expose one account's preferences to another account", () => {
    addSignal({ entityType: "author", entityId: "author-1", kind: "suppress" }, "owner-a");
    addSignal({ entityType: "author", entityId: "author-2", kind: "show_more" }, "owner-b");

    expect(loadSignals("owner-a").map((signal) => signal.entityId)).toEqual(["author-1"]);
    expect(loadSignals("owner-b").map((signal) => signal.entityId)).toEqual(["author-2"]);
  });

  it("replaces an opposing explicit preference", () => {
    addSignal({ entityType: "edition", entityId: "edition-1", kind: "show_more" }, "owner-a");
    addSignal({ entityType: "edition", entityId: "edition-1", kind: "show_less" }, "owner-a");

    const signals = loadSignals("owner-a");
    expect(signals).toHaveLength(1);
    expect(signals[0].kind).toBe("show_less");
  });

  it("rejects a distinct addition when the store is full of non-evictable signals", () => {
    for (let index = 0; index < 2_000; index++) {
      addSignal({
        entityType: "edition",
        entityId: `edition-${index}`,
        kind: "show_more",
        provenance: "user_explicit"
      }, "owner-a");
    }

    const result = addSignal({
      entityType: "edition",
      entityId: "edition-over-cap",
      kind: "show_more",
      provenance: "user_explicit"
    }, "owner-a");

    expect(result).toHaveLength(2_000);
    expect(result.some((signal) => signal.entityId === "edition-over-cap")).toBe(false);
  });
});
