import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actionKey, clearModerationQueue, enqueueModerationAction, loadModerationQueue, replaceModerationQueue } from "./sync-queue";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

beforeEach(() => vi.stubGlobal("localStorage", new MemoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe("moderation sync queue", () => {
  it("isolates queue records by authenticated owner", () => {
    enqueueModerationAction("owner-a", { kind: "block", accountId: "1" });
    enqueueModerationAction("owner-b", { kind: "mute", accountId: "2" });
    expect(loadModerationQueue("owner-a").map((item) => item.action.kind)).toEqual(["block"]);
    expect(loadModerationQueue("owner-b").map((item) => item.action.kind)).toEqual(["mute"]);
  });

  it("replaces conflicting actions for the same target", () => {
    enqueueModerationAction("owner", { kind: "block", accountId: "1" });
    enqueueModerationAction("owner", { kind: "unblock", accountId: "1" });
    const queue = loadModerationQueue("owner");
    expect(queue).toHaveLength(1);
    expect(queue[0].action.kind).toBe("unblock");
  });

  it("deduplicates filter create/delete by normalized signature", () => {
    const create = { kind: "filter_create", title: "Spoiler", context: ["home"], filterAction: "warn", keyword: "Spoiler", wholeWord: true } as const;
    const remove = { kind: "filter_delete", keyword: " spoiler ", wholeWord: true, filterAction: "warn" } as const;
    expect(actionKey(create)).toBe(actionKey(remove));
    enqueueModerationAction("owner", create);
    enqueueModerationAction("owner", remove);
    expect(loadModerationQueue("owner")[0].action.kind).toBe("filter_delete");
  });

  it("enforces FIFO capacity at 100 without cross-owner eviction", () => {
    for (let index = 0; index < 105; index++) enqueueModerationAction("owner", { kind: "block", accountId: String(index) });
    const queue = loadModerationQueue("owner");
    expect(queue).toHaveLength(100);
    expect((queue[0].action as { accountId: string }).accountId).toBe("5");
  });

  it("drops corrupted and foreign-owner persisted records", () => {
    const valid = enqueueModerationAction("owner", { kind: "mute", accountId: "1" })[0];
    replaceModerationQueue("owner", [valid, { ...valid, ownerAccountId: "other" }, { ...valid, attempts: -1 }]);
    expect(loadModerationQueue("owner")).toEqual([valid]);
  });

  it("clears only the selected owner partition", () => {
    enqueueModerationAction("a", { kind: "block", accountId: "1" });
    enqueueModerationAction("b", { kind: "block", accountId: "2" });
    clearModerationQueue("a");
    expect(loadModerationQueue("a")).toEqual([]);
    expect(loadModerationQueue("b")).toHaveLength(1);
  });
});
