import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModerationProxyError } from "./moderation-proxy-api";
import { enqueueModerationAction, loadModerationQueue } from "./sync-queue";
import { computeModerationBackoff, drainModerationQueue } from "./sync-service";

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

describe("moderation sync service", () => {
  it("uses bounded full-jitter exponential backoff", () => {
    expect(computeModerationBackoff(1, () => 0)).toBe(0);
    expect(computeModerationBackoff(1, () => 1)).toBe(1000);
    expect(computeModerationBackoff(2, () => 1)).toBe(2000);
    expect(computeModerationBackoff(20, () => 1)).toBe(60000);
  });

  it("drains successful actions in queue order", async () => {
    enqueueModerationAction("owner", { kind: "block", accountId: "1" });
    enqueueModerationAction("owner", { kind: "mute", accountId: "2" });
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;

    const result = await drainModerationQueue("owner", { fetchImpl, now: () => Date.now() + 1 });
    expect(result).toEqual({ drained: 2, remaining: 0, dropped: 0 });
    expect(calls[0]).toContain("/block");
    expect(calls[1]).toContain("/mute");
    expect(loadModerationQueue("owner")).toEqual([]);
  });

  it("retains retryable failures with delayed next-attempt time", async () => {
    enqueueModerationAction("owner", { kind: "block", accountId: "1" });
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 503 })) as unknown as typeof fetch;
    const result = await drainModerationQueue("owner", { fetchImpl, now: () => 1000, random: () => 1 });
    expect(result).toEqual({ drained: 0, remaining: 1, dropped: 0 });
    expect(loadModerationQueue("owner")[0]).toMatchObject({ attempts: 1, nextAttemptAt: 2000 });
  });

  it("drops non-retryable authorization failures", async () => {
    enqueueModerationAction("owner", { kind: "block", accountId: "1" });
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 403 })) as unknown as typeof fetch;
    const result = await drainModerationQueue("owner", { fetchImpl, now: () => Date.now() + 1 });
    expect(result).toEqual({ drained: 0, remaining: 0, dropped: 1 });
  });

  it("marks 429 and server failures retryable", () => {
    expect(new ModerationProxyError(429, true).retryable).toBe(true);
    expect(new ModerationProxyError(400, false).retryable).toBe(false);
  });
});
