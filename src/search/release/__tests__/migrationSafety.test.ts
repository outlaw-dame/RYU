import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canDisableEnhancedSearch,
  canRecoverFromCorruptVectors,
  checkMigrationSafety,
  recordSuccessfulMigration
} from "../migrationSafety";
import { CURRENT_SCHEMA_VERSION } from "../../../db/runtime-schema";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.has(key) ? this.store.get(key) as string : null; }
  key(index: number) { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("migrationSafety", () => {
  it("first run (no persisted version) is safe", () => {
    const result = checkMigrationSafety();
    expect(result.safe).toBe(true);
    expect(result.schemaVersionMatch).toBe(true);
    expect(result.vectorRebuildRequired).toBe(false);
  });

  it("matching version is safe with no rebuild", () => {
    recordSuccessfulMigration();
    const result = checkMigrationSafety();
    expect(result.safe).toBe(true);
    expect(result.schemaVersionMatch).toBe(true);
    expect(result.vectorRebuildRequired).toBe(false);
  });

  it("forward migration is safe but requires vector rebuild", () => {
    localStorage.setItem("ryu.search.schema-version.v1", "0");
    const result = checkMigrationSafety();
    expect(result.safe).toBe(true);
    expect(result.schemaVersionMatch).toBe(false);
    expect(result.vectorRebuildRequired).toBe(true);
    expect(result.reason).toContain("Upgrading");
  });

  it("downgrade is safe but requires vector rebuild and warns", () => {
    localStorage.setItem("ryu.search.schema-version.v1", "99");
    const result = checkMigrationSafety();
    expect(result.safe).toBe(true);
    expect(result.vectorRebuildRequired).toBe(true);
    expect(result.reason).toContain("Downgrade");
  });

  it("recordSuccessfulMigration persists the current version", () => {
    recordSuccessfulMigration();
    expect(localStorage.getItem("ryu.search.schema-version.v1")).toBe(String(CURRENT_SCHEMA_VERSION));
  });

  it("canDisableEnhancedSearch always returns true", () => {
    expect(canDisableEnhancedSearch()).toBe(true);
  });

  it("canRecoverFromCorruptVectors always returns true", () => {
    expect(canRecoverFromCorruptVectors()).toBe(true);
  });
});
