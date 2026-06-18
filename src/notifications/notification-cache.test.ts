import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadCachedNotifications,
  saveCachedNotifications,
  clearNotificationCache
} from "./notification-cache";
import type { RawNotification } from "./types";

function makeNotification(id: string, createdAt: string): RawNotification {
  return {
    id,
    type: "favourite",
    created_at: createdAt,
    account: { id: "acc-1", display_name: "Alice" },
    status: { id: "status-1", content: "Hello", created_at: "2024-01-14T09:00:00Z" }
  };
}

describe("notification-cache", () => {
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

  describe("loadCachedNotifications", () => {
    it("returns empty array when no cache exists", () => {
      expect(loadCachedNotifications()).toEqual([]);
    });

    it("loads cached notifications", () => {
      const notifications = [makeNotification("1", "2024-01-15T10:00:00Z")];
      mockStorage.set("ryu.notifications.cache", JSON.stringify({
        version: 1,
        updatedAt: "2024-01-15T10:00:00Z",
        notifications
      }));

      const result = loadCachedNotifications();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("returns empty on invalid version", () => {
      mockStorage.set("ryu.notifications.cache", JSON.stringify({
        version: 999,
        updatedAt: "2024-01-15T10:00:00Z",
        notifications: []
      }));

      expect(loadCachedNotifications()).toEqual([]);
    });

    it("returns empty on corrupt data", () => {
      mockStorage.set("ryu.notifications.cache", "not json");
      expect(loadCachedNotifications()).toEqual([]);
    });
  });

  describe("saveCachedNotifications", () => {
    it("saves and can be reloaded", () => {
      const notifications = [
        makeNotification("1", "2024-01-15T10:00:00Z"),
        makeNotification("2", "2024-01-15T09:00:00Z")
      ];

      saveCachedNotifications(notifications);
      const result = loadCachedNotifications();
      expect(result).toHaveLength(2);
    });

    it("merges with existing cache and deduplicates", () => {
      const existing = [makeNotification("1", "2024-01-15T10:00:00Z")];
      saveCachedNotifications(existing);

      const newer = [
        makeNotification("2", "2024-01-15T11:00:00Z"),
        makeNotification("1", "2024-01-15T10:00:00Z") // duplicate
      ];
      saveCachedNotifications(newer);

      const result = loadCachedNotifications();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("2"); // most recent first
      expect(result[1].id).toBe("1");
    });

    it("trims cache to 200 entries", () => {
      const manyNotifications = Array.from({ length: 250 }, (_, i) =>
        makeNotification(`n-${i}`, `2024-01-${String(15).padStart(2, "0")}T${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00Z`)
      );

      saveCachedNotifications(manyNotifications);
      const result = loadCachedNotifications();
      expect(result.length).toBeLessThanOrEqual(200);
    });
  });

  describe("clearNotificationCache", () => {
    it("removes cache from storage", () => {
      saveCachedNotifications([makeNotification("1", "2024-01-15T10:00:00Z")]);
      clearNotificationCache();
      expect(loadCachedNotifications()).toEqual([]);
    });
  });
});
