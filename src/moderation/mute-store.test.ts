import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadMuteList,
  saveMuteList,
  addMute,
  removeMute,
  isMuted,
  getMuteEntry,
  purgeExpiredMutes,
  isExpired
} from "./mute-store";
import type { MuteEntry } from "./types";

describe("mute-store", () => {
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

  describe("loadMuteList", () => {
    it("returns empty array when no data exists", () => {
      expect(loadMuteList()).toEqual([]);
    });

    it("returns empty array for invalid JSON", () => {
      mockStorage.set("ryu:mute-list", "not-json");
      expect(loadMuteList()).toEqual([]);
    });

    it("loads saved mutes", () => {
      const entries: MuteEntry[] = [{
        accountId: "123",
        acct: "user@instance.tld",
        createdAt: "2024-01-01T00:00:00Z",
        expiresAt: null,
        hideNotifications: true
      }];
      mockStorage.set("ryu:mute-list", JSON.stringify(entries));
      expect(loadMuteList()).toEqual(entries);
    });

    it("filters expired mutes on load", () => {
      const entries: MuteEntry[] = [
        {
          accountId: "123",
          createdAt: "2024-01-01T00:00:00Z",
          expiresAt: "2020-01-01T00:00:00Z", // expired
          hideNotifications: true
        },
        {
          accountId: "456",
          createdAt: "2024-01-01T00:00:00Z",
          expiresAt: null, // permanent
          hideNotifications: false
        }
      ];
      mockStorage.set("ryu:mute-list", JSON.stringify(entries));
      const result = loadMuteList();
      expect(result).toHaveLength(1);
      expect(result[0].accountId).toBe("456");
    });
  });

  describe("addMute", () => {
    it("adds a permanent mute", () => {
      const result = addMute("123", { acct: "user@test.social" });
      expect(result).toHaveLength(1);
      expect(result[0].accountId).toBe("123");
      expect(result[0].acct).toBe("user@test.social");
      expect(result[0].expiresAt).toBeNull();
      expect(result[0].hideNotifications).toBe(true);
    });

    it("adds a timed mute", () => {
      const result = addMute("123", { durationMs: 3600000 });
      expect(result).toHaveLength(1);
      expect(result[0].expiresAt).not.toBeNull();
    });

    it("updates existing mute", () => {
      addMute("123", { hideNotifications: true });
      const result = addMute("123", { hideNotifications: false });
      expect(result).toHaveLength(1);
      expect(result[0].hideNotifications).toBe(false);
    });

    it("persists to localStorage", () => {
      addMute("123");
      const stored = mockStorage.get("ryu:mute-list");
      expect(stored).toBeDefined();
      expect(JSON.parse(stored!)).toHaveLength(1);
    });
  });

  describe("removeMute", () => {
    it("removes an existing mute", () => {
      addMute("123");
      addMute("456");
      const result = removeMute("123");
      expect(result).toHaveLength(1);
      expect(result[0].accountId).toBe("456");
    });

    it("does nothing for non-existent account", () => {
      addMute("123");
      const result = removeMute("999");
      expect(result).toHaveLength(1);
    });
  });

  describe("isMuted", () => {
    it("returns true for muted accounts", () => {
      addMute("123");
      expect(isMuted("123")).toBe(true);
    });

    it("returns false for non-muted accounts", () => {
      expect(isMuted("123")).toBe(false);
    });

    it("returns false for expired mutes", () => {
      const entries: MuteEntry[] = [{
        accountId: "123",
        createdAt: "2024-01-01T00:00:00Z",
        expiresAt: "2020-01-01T00:00:00Z",
        hideNotifications: true
      }];
      mockStorage.set("ryu:mute-list", JSON.stringify(entries));
      expect(isMuted("123")).toBe(false);
    });
  });

  describe("getMuteEntry", () => {
    it("returns the mute entry for muted accounts", () => {
      addMute("123", { acct: "user@test.social" });
      const entry = getMuteEntry("123");
      expect(entry).toBeDefined();
      expect(entry!.accountId).toBe("123");
    });

    it("returns undefined for non-muted accounts", () => {
      expect(getMuteEntry("123")).toBeUndefined();
    });
  });

  describe("isExpired", () => {
    it("returns false for permanent mutes", () => {
      const entry: MuteEntry = {
        accountId: "123",
        createdAt: "2024-01-01T00:00:00Z",
        expiresAt: null,
        hideNotifications: true
      };
      expect(isExpired(entry)).toBe(false);
    });

    it("returns true for past expiry", () => {
      const entry: MuteEntry = {
        accountId: "123",
        createdAt: "2024-01-01T00:00:00Z",
        expiresAt: "2020-01-01T00:00:00Z",
        hideNotifications: true
      };
      expect(isExpired(entry)).toBe(true);
    });

    it("returns false for future expiry", () => {
      const entry: MuteEntry = {
        accountId: "123",
        createdAt: "2024-01-01T00:00:00Z",
        expiresAt: "2099-01-01T00:00:00Z",
        hideNotifications: true
      };
      expect(isExpired(entry)).toBe(false);
    });
  });

  describe("purgeExpiredMutes", () => {
    it("removes expired mutes from storage", () => {
      const entries: MuteEntry[] = [
        {
          accountId: "123",
          createdAt: "2024-01-01T00:00:00Z",
          expiresAt: "2020-01-01T00:00:00Z",
          hideNotifications: true
        },
        {
          accountId: "456",
          createdAt: "2024-01-01T00:00:00Z",
          expiresAt: null,
          hideNotifications: false
        }
      ];
      mockStorage.set("ryu:mute-list", JSON.stringify(entries));
      const result = purgeExpiredMutes();
      expect(result).toHaveLength(1);
      expect(result[0].accountId).toBe("456");
    });
  });
});
