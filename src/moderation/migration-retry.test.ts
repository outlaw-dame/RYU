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

const owner = "https://books.example#42";

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  resetMigrationState();
});

describe("moderation migration retry semantics", () => {
  it("does not mark a partially failed migration complete and succeeds on retry", async () => {
    localStorage.setItem("ryu:mute-list", JSON.stringify([
      { accountId: "one" },
      { accountId: "two" }
    ]));

    const upsert = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("temporary database failure"))
      .mockResolvedValue(undefined);
    const db = { moderationpolicies: { upsert } } as unknown as RyuDatabase;

    await expect(migrateModerationToRxDB(db, owner))
      .rejects.toThrow("retry required");
    expect(isMigrationComplete(owner)).toBe(false);

    await expect(migrateModerationToRxDB(db, owner)).resolves.toEqual({
      mutes: 2,
      blocks: 0,
      domains: 0,
      filters: 0
    });
    expect(isMigrationComplete(owner)).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(4);
  });
});
