import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadReadState,
  saveReadState,
  markAsRead,
  markMultipleAsRead,
  markAllAsRead,
  isNotificationRead,
  isGroupRead
} from "./read-state";
import type { ReadState } from "./types";

describe("read-state", () => {
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

  describe("loadReadState", () => {
    it("returns empty state when nothing stored", () => {
      const state = loadReadState();
      expect(state.readIds.size).toBe(0);
      expect(state.markAllReadAt).toBeNull();
    });

    it("loads persisted state", () => {
      mockStorage.set("ryu.notifications.read-state", JSON.stringify({
        readIds: ["n-1", "n-2"],
        markAllReadAt: "2024-01-15T10:00:00Z"
      }));

      const state = loadReadState();
      expect(state.readIds.has("n-1")).toBe(true);
      expect(state.readIds.has("n-2")).toBe(true);
      expect(state.markAllReadAt).toBe("2024-01-15T10:00:00Z");
    });

    it("returns empty state on corrupt data", () => {
      mockStorage.set("ryu.notifications.read-state", "not json");
      const state = loadReadState();
      expect(state.readIds.size).toBe(0);
    });
  });

  describe("saveReadState", () => {
    it("persists read state to storage", () => {
      const state: ReadState = {
        readIds: new Set(["n-1", "n-2"]),
        markAllReadAt: "2024-01-15T10:00:00Z"
      };

      saveReadState(state);
      const raw = mockStorage.get("ryu.notifications.read-state");
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw!);
      expect(parsed.readIds).toContain("n-1");
      expect(parsed.readIds).toContain("n-2");
      expect(parsed.markAllReadAt).toBe("2024-01-15T10:00:00Z");
    });
  });

  describe("markAsRead", () => {
    it("adds notification ID to read set", () => {
      const state: ReadState = { readIds: new Set(), markAllReadAt: null };
      const next = markAsRead(state, "n-1");
      expect(next.readIds.has("n-1")).toBe(true);
    });

    it("does not duplicate existing ID", () => {
      const state: ReadState = { readIds: new Set(["n-1"]), markAllReadAt: null };
      const next = markAsRead(state, "n-1");
      expect(next).toBe(state); // Same reference, no change
    });
  });

  describe("markMultipleAsRead", () => {
    it("marks multiple IDs as read", () => {
      const state: ReadState = { readIds: new Set(), markAllReadAt: null };
      const next = markMultipleAsRead(state, ["n-1", "n-2", "n-3"]);
      expect(next.readIds.has("n-1")).toBe(true);
      expect(next.readIds.has("n-2")).toBe(true);
      expect(next.readIds.has("n-3")).toBe(true);
    });
  });

  describe("markAllAsRead", () => {
    it("sets markAllReadAt and clears readIds", () => {
      const state: ReadState = { readIds: new Set(["n-1"]), markAllReadAt: null };
      const next = markAllAsRead(state);
      expect(next.readIds.size).toBe(0);
      expect(next.markAllReadAt).toBeDefined();
      expect(typeof next.markAllReadAt).toBe("string");
    });
  });

  describe("isNotificationRead", () => {
    it("returns true if ID is in readIds", () => {
      const state: ReadState = { readIds: new Set(["n-1"]), markAllReadAt: null };
      expect(isNotificationRead(state, "n-1", "2024-01-15T10:00:00Z")).toBe(true);
    });

    it("returns true if created_at is before markAllReadAt", () => {
      const state: ReadState = { readIds: new Set(), markAllReadAt: "2024-01-15T12:00:00Z" };
      expect(isNotificationRead(state, "n-1", "2024-01-15T10:00:00Z")).toBe(true);
    });

    it("returns false if neither condition is met", () => {
      const state: ReadState = { readIds: new Set(), markAllReadAt: "2024-01-15T08:00:00Z" };
      expect(isNotificationRead(state, "n-1", "2024-01-15T10:00:00Z")).toBe(false);
    });
  });

  describe("isGroupRead", () => {
    it("returns true if markAllReadAt covers the group", () => {
      const state: ReadState = { readIds: new Set(), markAllReadAt: "2024-01-15T12:00:00Z" };
      expect(isGroupRead(state, ["n-1", "n-2"], "2024-01-15T10:00:00Z")).toBe(true);
    });

    it("returns true if all IDs are in readIds", () => {
      const state: ReadState = { readIds: new Set(["n-1", "n-2"]), markAllReadAt: null };
      expect(isGroupRead(state, ["n-1", "n-2"], "2024-01-15T10:00:00Z")).toBe(true);
    });

    it("returns false if not all IDs are read", () => {
      const state: ReadState = { readIds: new Set(["n-1"]), markAllReadAt: null };
      expect(isGroupRead(state, ["n-1", "n-2"], "2024-01-15T10:00:00Z")).toBe(false);
    });
  });
});
