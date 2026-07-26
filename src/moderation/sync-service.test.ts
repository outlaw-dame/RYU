import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueModerationAction, loadModerationQueue } from "./offline-queue";
import { moderationBackoffMs, replayModerationQueue } from "./sync-service";

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

describe("moderation sync service", () => {
  it("removes successfully replayed actions", async () => {
    enqueueModerationAction("owner-a", "mute", { accountId: "42" }, new Date("2026-01-01T00:00:00.000Z"));
    const transport = vi.fn(async () => new Response("{}", { status: 200 }));

    const result = await replayModerationQueue("owner-a", {
      transport,
      now: new Date("2026-01-01T00:00:01.000Z")
    });

    expect(result).toEqual({ processed: 1, succeeded: 1, deferred: 0, blocked: 0 });
    expect(loadModerationQueue("owner-a")).toEqual([]);
  });

  it("honors Retry-After for rate limits", async () => {
    enqueueModerationAction("owner-a", "block", { accountId: "42" }, new Date("2026-01-01T00:00:00.000Z"));
    const transport = vi.fn(async () => new Response("", {
      status: 429,
      headers: { "Retry-After": "30" }
    }));

    const result = await replayModerationQueue("owner-a", {
      transport,
      now: new Date("2026-01-01T00:00:01.000Z")
    });

    expect(result.deferred).toBe(1);
    expect(loadModerationQueue("owner-a")[0].nextAttemptAt).toBe("2026-01-01T00:00:31.000Z");
  });

  it("stops on authorization failures without retrying later items", async () => {
    enqueueModerationAction("owner-a", "mute", { accountId: "1" }, new Date("2026-01-01T00:00:00.000Z"));
    enqueueModerationAction("owner-a", "block", { accountId: "2" }, new Date("2026-01-01T00:00:00.100Z"));
    const transport = vi.fn(async () => new Response("", { status: 401 }));

    const result = await replayModerationQueue("owner-a", {
      transport,
      now: new Date("2026-01-01T00:00:01.000Z")
    });

    expect(result).toEqual({ processed: 1, succeeded: 0, deferred: 0, blocked: 1 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(loadModerationQueue("owner-a")).toHaveLength(2);
  });

  it("treats idempotent 404 and conflict responses as completed", async () => {
    enqueueModerationAction("owner-a", "unmute", { accountId: "42" }, new Date("2026-01-01T00:00:00.000Z"));
    const transport = vi.fn(async () => new Response("", { status: 404 }));

    const result = await replayModerationQueue("owner-a", {
      transport,
      now: new Date("2026-01-01T00:00:01.000Z")
    });

    expect(result.succeeded).toBe(1);
    expect(loadModerationQueue("owner-a")).toEqual([]);
  });

  it("uses bounded full-jitter backoff", () => {
    expect(moderationBackoffMs(1, () => 0)).toBe(0);
    expect(moderationBackoffMs(1, () => 0.999)).toBeLessThan(2_000);
    expect(moderationBackoffMs(100, () => 0.999)).toBeLessThanOrEqual(60_000);
  });
});
