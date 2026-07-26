import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearModerationQueue, deferModerationQueueItem, enqueueModerationAction, loadModerationQueue, moderationTargetKey } from "./offline-queue";

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

describe("moderation offline queue", () => {
  it("isolates queues by authenticated owner", () => {
    enqueueModerationAction("owner-a", "mute", { accountId: "42" });
    enqueueModerationAction("owner-b", "block", { accountId: "99" });
    expect(loadModerationQueue("owner-a").map((item) => item.payload.accountId)).toEqual(["42"]);
    expect(loadModerationQueue("owner-b").map((item) => item.payload.accountId)).toEqual(["99"]);
  });

  it("keeps only the newest intent within one relationship kind", () => {
    enqueueModerationAction("owner-a", "mute", { accountId: "42" });
    enqueueModerationAction("owner-a", "unmute", { accountId: "42" });
    const queue = loadModerationQueue("owner-a");
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe("unmute");
  });

  it("preserves independent mute and block protections", () => {
    enqueueModerationAction("owner-a", "mute", { accountId: "42" });
    enqueueModerationAction("owner-a", "block", { accountId: "42" });
    expect(loadModerationQueue("owner-a").map((item) => item.type)).toEqual(["mute", "block"]);
  });

  it("compacts filter create and delete by stable local identity", () => {
    enqueueModerationAction("owner-a", "filter_create", { filterId: "local-1", phrase: "spoiler" });
    enqueueModerationAction("owner-a", "filter_delete", { filterId: "local-1" });
    const queue = loadModerationQueue("owner-a");
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe("filter_delete");
  });

  it("defers failures without losing the original action", () => {
    const [item] = enqueueModerationAction("owner-a", "block", { accountId: "42" });
    deferModerationQueueItem("owner-a", item.id, new Date("2030-01-01T00:00:00.000Z"), "network");
    const [deferred] = loadModerationQueue("owner-a");
    expect(deferred.attempts).toBe(1);
    expect(deferred.lastErrorCode).toBe("network");
    expect(deferred.nextAttemptAt).toBe("2030-01-01T00:00:00.000Z");
  });

  it("rejects malformed targets", () => {
    expect(moderationTargetKey("mute", {})).toBeNull();
    expect(enqueueModerationAction("owner-a", "mute", {})).toEqual([]);
    expect(enqueueModerationAction("owner-a", "filter_create", { phrase: "missing id" })).toEqual([]);
  });

  it("can clear one owner's queue without touching another", () => {
    enqueueModerationAction("owner-a", "mute", { accountId: "42" });
    enqueueModerationAction("owner-b", "mute", { accountId: "42" });
    clearModerationQueue("owner-a");
    expect(loadModerationQueue("owner-a")).toEqual([]);
    expect(loadModerationQueue("owner-b")).toHaveLength(1);
  });
});
