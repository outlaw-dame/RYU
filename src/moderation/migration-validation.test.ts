import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RyuDatabase } from "../db/client";
import { isMigrationComplete, migrateModerationToRxDB, resetMigrationState } from "./migration";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  resetMigrationState();
});

describe("moderation migration legacy validation", () => {
  it("bounds oversized filter phrases instead of permanently poisoning migration", async () => {
    const owner = "https://books.example#42";
    localStorage.setItem("ryu:content-filters", JSON.stringify([
      { id: "legacy-filter", phrase: "x".repeat(5_000), action: "hide" }
    ]));

    const upsert = vi.fn().mockResolvedValue(undefined);
    const db = { moderationpolicies: { upsert } } as unknown as RyuDatabase;

    await expect(migrateModerationToRxDB(db, owner)).resolves.toEqual({
      mutes: 0,
      blocks: 0,
      domains: 0,
      filters: 1
    });
    expect(isMigrationComplete(owner)).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]?.[0].keywords[0].keyword).toHaveLength(4096);
  });
});
