import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadSafeSearchLevel,
  saveSafeSearchLevel,
  shouldFilterSensitive,
  hasContentWarning,
  DEFAULT_SAFE_SEARCH_LEVEL
} from "./safe-search";

describe("safe-search", () => {
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

  describe("DEFAULT_SAFE_SEARCH_LEVEL", () => {
    it("defaults to strict", () => {
      expect(DEFAULT_SAFE_SEARCH_LEVEL).toBe("strict");
    });
  });

  describe("loadSafeSearchLevel", () => {
    it("returns strict by default", () => {
      expect(loadSafeSearchLevel()).toBe("strict");
    });

    it("returns stored value", () => {
      mockStorage.set("ryu:safe-search-level", "moderate");
      expect(loadSafeSearchLevel()).toBe("moderate");
    });

    it("returns strict for invalid stored value", () => {
      mockStorage.set("ryu:safe-search-level", "invalid");
      expect(loadSafeSearchLevel()).toBe("strict");
    });
  });

  describe("saveSafeSearchLevel", () => {
    it("saves to localStorage", () => {
      saveSafeSearchLevel("off");
      expect(mockStorage.get("ryu:safe-search-level")).toBe("off");
    });
  });

  describe("shouldFilterSensitive", () => {
    describe("strict mode", () => {
      beforeEach(() => {
        mockStorage.set("ryu:safe-search-level", "strict");
      });

      it("filters sensitive content", () => {
        expect(shouldFilterSensitive(true, undefined)).toBe(true);
      });

      it("filters content with spoiler text", () => {
        expect(shouldFilterSensitive(false, "spoiler warning")).toBe(true);
      });

      it("does not filter clean content", () => {
        expect(shouldFilterSensitive(false, undefined)).toBe(false);
        expect(shouldFilterSensitive(false, "")).toBe(false);
      });
    });

    describe("moderate mode", () => {
      beforeEach(() => {
        mockStorage.set("ryu:safe-search-level", "moderate");
      });

      it("filters sensitive content", () => {
        expect(shouldFilterSensitive(true, undefined)).toBe(true);
      });

      it("does not filter content with only spoiler text", () => {
        expect(shouldFilterSensitive(false, "content warning")).toBe(false);
      });

      it("does not filter clean content", () => {
        expect(shouldFilterSensitive(false, undefined)).toBe(false);
      });
    });

    describe("off mode", () => {
      beforeEach(() => {
        mockStorage.set("ryu:safe-search-level", "off");
      });

      it("never filters sensitive content", () => {
        expect(shouldFilterSensitive(true, undefined)).toBe(false);
      });

      it("never filters content with spoiler text", () => {
        expect(shouldFilterSensitive(true, "nsfw")).toBe(false);
      });
    });
  });

  describe("hasContentWarning", () => {
    it("returns true for non-empty spoiler text", () => {
      expect(hasContentWarning("content warning")).toBe(true);
    });

    it("returns false for empty string", () => {
      expect(hasContentWarning("")).toBe(false);
    });

    it("returns false for whitespace only", () => {
      expect(hasContentWarning("   ")).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(hasContentWarning(undefined)).toBe(false);
    });
  });
});
