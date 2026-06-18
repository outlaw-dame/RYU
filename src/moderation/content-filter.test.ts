import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadContentFilters,
  addContentFilter,
  removeContentFilter,
  updateContentFilter,
  matchesFilter,
  checkContentFilters,
  purgeExpiredFilters
} from "./content-filter";
import type { ContentFilter } from "./types";

describe("content-filter", () => {
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

  describe("loadContentFilters", () => {
    it("returns empty array when no data", () => {
      expect(loadContentFilters()).toEqual([]);
    });

    it("returns empty array for invalid JSON", () => {
      mockStorage.set("ryu:content-filters", "bad");
      expect(loadContentFilters()).toEqual([]);
    });

    it("filters expired entries", () => {
      const filters: ContentFilter[] = [
        {
          id: "f1",
          phrase: "spam",
          wholeWord: false,
          action: "hide",
          createdAt: "2024-01-01T00:00:00Z",
          expiresAt: "2020-01-01T00:00:00Z"
        },
        {
          id: "f2",
          phrase: "test",
          wholeWord: false,
          action: "warn",
          createdAt: "2024-01-01T00:00:00Z",
          expiresAt: null
        }
      ];
      mockStorage.set("ryu:content-filters", JSON.stringify(filters));
      const result = loadContentFilters();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("f2");
    });
  });

  describe("addContentFilter", () => {
    it("adds a filter with defaults", () => {
      const result = addContentFilter("spoiler");
      expect(result).toHaveLength(1);
      expect(result[0].phrase).toBe("spoiler");
      expect(result[0].action).toBe("hide");
      expect(result[0].wholeWord).toBe(false);
      expect(result[0].expiresAt).toBeNull();
    });

    it("adds a filter with options", () => {
      const result = addContentFilter("nsfw", {
        wholeWord: true,
        action: "blur",
        durationMs: 86400000
      });
      expect(result).toHaveLength(1);
      expect(result[0].wholeWord).toBe(true);
      expect(result[0].action).toBe("blur");
      expect(result[0].expiresAt).not.toBeNull();
    });

    it("trims whitespace from phrase", () => {
      const result = addContentFilter("  trimmed  ");
      expect(result[0].phrase).toBe("trimmed");
    });
  });

  describe("removeContentFilter", () => {
    it("removes a filter by ID", () => {
      const added = addContentFilter("one");
      addContentFilter("two");
      const result = removeContentFilter(added[0].id);
      expect(result).toHaveLength(1);
      expect(result[0].phrase).toBe("two");
    });
  });

  describe("updateContentFilter", () => {
    it("updates filter properties", () => {
      const added = addContentFilter("test", { action: "hide" });
      const result = updateContentFilter(added[0].id, { action: "warn", phrase: "updated" });
      expect(result[0].action).toBe("warn");
      expect(result[0].phrase).toBe("updated");
    });
  });

  describe("matchesFilter", () => {
    it("matches substring by default", () => {
      const filter: ContentFilter = {
        id: "f1",
        phrase: "spoiler",
        wholeWord: false,
        action: "hide",
        createdAt: "2024-01-01T00:00:00Z",
        expiresAt: null
      };
      expect(matchesFilter("this is a spoiler alert", filter)).toBe(true);
      expect(matchesFilter("no match here", filter)).toBe(false);
    });

    it("matches case-insensitively", () => {
      const filter: ContentFilter = {
        id: "f1",
        phrase: "SPAM",
        wholeWord: false,
        action: "hide",
        createdAt: "2024-01-01T00:00:00Z",
        expiresAt: null
      };
      expect(matchesFilter("this is spam content", filter)).toBe(true);
    });

    it("matches whole word only when configured", () => {
      const filter: ContentFilter = {
        id: "f1",
        phrase: "cat",
        wholeWord: true,
        action: "hide",
        createdAt: "2024-01-01T00:00:00Z",
        expiresAt: null
      };
      expect(matchesFilter("I love my cat", filter)).toBe(true);
      expect(matchesFilter("concatenation is useful", filter)).toBe(false);
    });

    it("does not match expired filters", () => {
      const filter: ContentFilter = {
        id: "f1",
        phrase: "test",
        wholeWord: false,
        action: "hide",
        createdAt: "2024-01-01T00:00:00Z",
        expiresAt: "2020-01-01T00:00:00Z"
      };
      expect(matchesFilter("test content", filter)).toBe(false);
    });

    it("escapes regex special characters", () => {
      const filter: ContentFilter = {
        id: "f1",
        phrase: "hello (world)",
        wholeWord: false,
        action: "hide",
        createdAt: "2024-01-01T00:00:00Z",
        expiresAt: null
      };
      expect(matchesFilter("say hello (world) to everyone", filter)).toBe(true);
      expect(matchesFilter("hello world", filter)).toBe(false);
    });
  });

  describe("checkContentFilters", () => {
    it("returns undefined when no filters match", () => {
      addContentFilter("spam");
      expect(checkContentFilters("clean content")).toBeUndefined();
    });

    it("returns matching filter", () => {
      addContentFilter("spam", { action: "hide" });
      const result = checkContentFilters("this is spam");
      expect(result).toBeDefined();
      expect(result!.phrase).toBe("spam");
    });

    it("returns highest severity filter when multiple match", () => {
      addContentFilter("bad", { action: "warn" });
      addContentFilter("bad word", { action: "hide" });
      const result = checkContentFilters("this is a bad word");
      expect(result).toBeDefined();
      expect(result!.action).toBe("hide");
    });
  });

  describe("purgeExpiredFilters", () => {
    it("removes expired filters from storage", () => {
      const filters: ContentFilter[] = [
        {
          id: "f1",
          phrase: "expired",
          wholeWord: false,
          action: "hide",
          createdAt: "2024-01-01T00:00:00Z",
          expiresAt: "2020-01-01T00:00:00Z"
        },
        {
          id: "f2",
          phrase: "active",
          wholeWord: false,
          action: "warn",
          createdAt: "2024-01-01T00:00:00Z",
          expiresAt: null
        }
      ];
      mockStorage.set("ryu:content-filters", JSON.stringify(filters));
      const result = purgeExpiredFilters();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("f2");
    });
  });
});
