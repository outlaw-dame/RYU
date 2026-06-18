import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadBlockList,
  addBlock,
  removeBlock,
  isBlocked,
  getBlockEntry
} from "./block-store";

describe("block-store", () => {
  const mockStorage = new Map<string, string>();

  beforeEach(() => {
    mockStorage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mockStorage.get(key) ?? null,
      setItem: (key: string, value: string) => { mockStorage.set(key, value); },
      removeItem: (key: string) => { mockStorage.delete(key); }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("loadBlockList", () => {
    it("returns empty array when no data exists", () => {
      expect(loadBlockList()).toEqual([]);
    });

    it("returns empty array for invalid JSON", () => {
      mockStorage.set("ryu:block-list", "{invalid");
      expect(loadBlockList()).toEqual([]);
    });

    it("loads saved blocks", () => {
      const entries = [{ accountId: "123", acct: "user@test.tld", createdAt: "2024-01-01T00:00:00Z" }];
      mockStorage.set("ryu:block-list", JSON.stringify(entries));
      expect(loadBlockList()).toEqual(entries);
    });
  });

  describe("addBlock", () => {
    it("adds a new block entry", () => {
      const result = addBlock("123", "user@instance.tld");
      expect(result).toHaveLength(1);
      expect(result[0].accountId).toBe("123");
      expect(result[0].acct).toBe("user@instance.tld");
    });

    it("does not duplicate existing block", () => {
      addBlock("123");
      const result = addBlock("123");
      expect(result).toHaveLength(1);
    });

    it("persists to localStorage", () => {
      addBlock("123");
      const stored = mockStorage.get("ryu:block-list");
      expect(stored).toBeDefined();
      expect(JSON.parse(stored!)).toHaveLength(1);
    });
  });

  describe("removeBlock", () => {
    it("removes an existing block", () => {
      addBlock("123");
      addBlock("456");
      const result = removeBlock("123");
      expect(result).toHaveLength(1);
      expect(result[0].accountId).toBe("456");
    });

    it("no-ops for non-existent account", () => {
      addBlock("123");
      const result = removeBlock("999");
      expect(result).toHaveLength(1);
    });
  });

  describe("isBlocked", () => {
    it("returns true for blocked accounts", () => {
      addBlock("123");
      expect(isBlocked("123")).toBe(true);
    });

    it("returns false for non-blocked accounts", () => {
      expect(isBlocked("123")).toBe(false);
    });
  });

  describe("getBlockEntry", () => {
    it("returns entry for blocked account", () => {
      addBlock("123", "user@test.tld");
      const entry = getBlockEntry("123");
      expect(entry).toBeDefined();
      expect(entry!.acct).toBe("user@test.tld");
    });

    it("returns undefined for non-blocked account", () => {
      expect(getBlockEntry("123")).toBeUndefined();
    });
  });
});
