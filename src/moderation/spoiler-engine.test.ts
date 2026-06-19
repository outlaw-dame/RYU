import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateSpoiler,
  extractBookTitle,
  isGenericContentWarning,
  loadSpoilerPreferences,
  saveSpoilerPreferences,
  createLocalStorageReadingStatusLookup
} from "./spoiler-engine";
import type { SpoilerPreferences, ReadingStatusLookup } from "./spoiler-engine";

describe("spoiler-engine", () => {
  const mockStorage = new Map<string, string>();

  beforeEach(() => {
    mockStorage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mockStorage.get(key) ?? null,
      setItem: (key: string, value: string) => { mockStorage.set(key, value); },
      removeItem: (key: string) => { mockStorage.delete(key); },
      get length() { return mockStorage.size; },
      key: (index: number) => [...mockStorage.keys()][index] ?? null,
      clear: () => { mockStorage.clear(); }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("extractBookTitle", () => {
    it("extracts title from 'spoilers for <title>'", () => {
      expect(extractBookTitle("Contains spoilers for The Name of the Wind")).toBe("The Name of the Wind");
    });

    it("extracts title from 'spoiler for <title>'", () => {
      expect(extractBookTitle("Spoiler for Dune")).toBe("Dune");
    });

    it("extracts title from 'book spoilers: <title>'", () => {
      expect(extractBookTitle("Book spoilers: The Great Gatsby")).toBe("The Great Gatsby");
    });

    it("extracts title from 'spoiler - <title>'", () => {
      expect(extractBookTitle("Spoiler - Mistborn")).toBe("Mistborn");
    });

    it("extracts title from '<title> spoilers'", () => {
      expect(extractBookTitle("The Hobbit spoilers")).toBe("The Hobbit");
    });

    it("extracts title from 'cw: spoilers for <title>'", () => {
      expect(extractBookTitle("CW: spoilers for A Court of Thorns and Roses")).toBe("A Court of Thorns and Roses");
    });

    it("removes surrounding quotes from extracted title", () => {
      expect(extractBookTitle('Spoilers for "The Way of Kings"')).toBe("The Way of Kings");
    });

    it("returns null for empty input", () => {
      expect(extractBookTitle("")).toBeNull();
      expect(extractBookTitle("   ")).toBeNull();
    });

    it("returns null for generic CW text", () => {
      expect(extractBookTitle("nsfw")).toBeNull();
      expect(extractBookTitle("content warning")).toBeNull();
      expect(extractBookTitle("violence")).toBeNull();
    });
  });

  describe("isGenericContentWarning", () => {
    it("detects generic CW indicators", () => {
      expect(isGenericContentWarning("nsfw")).toBe(true);
      expect(isGenericContentWarning("NSFW")).toBe(true);
      expect(isGenericContentWarning("trigger warning")).toBe(true);
      expect(isGenericContentWarning("mental health")).toBe(true);
      expect(isGenericContentWarning("violence")).toBe(true);
      expect(isGenericContentWarning("cw: food")).toBe(true);
    });

    it("returns false for book-specific CW", () => {
      expect(isGenericContentWarning("Spoilers for Dune")).toBe(false);
      expect(isGenericContentWarning("The Name of the Wind spoilers")).toBe(false);
    });

    it("returns false for empty text", () => {
      expect(isGenericContentWarning("")).toBe(false);
      expect(isGenericContentWarning("   ")).toBe(false);
    });
  });

  describe("evaluateSpoiler", () => {
    const noopLookup: ReadingStatusLookup = () => undefined;

    it("returns no enforcement when no spoiler text", () => {
      const result = evaluateSpoiler(undefined, noopLookup);
      expect(result.shouldEnforce).toBe(false);
      expect(result.isBookSpoiler).toBe(false);
      expect(result.isGenericCW).toBe(false);
    });

    it("returns no enforcement for empty spoiler text", () => {
      const result = evaluateSpoiler("", noopLookup);
      expect(result.shouldEnforce).toBe(false);
    });

    it("detects generic CW and respects autoHideAllCW preference", () => {
      const prefs: SpoilerPreferences = {
        autoHideUnread: true,
        autoHideAllCW: false,
        showForReadBooks: true,
        showForDNF: false
      };
      const result = evaluateSpoiler("nsfw", noopLookup, prefs);
      expect(result.isGenericCW).toBe(true);
      expect(result.isBookSpoiler).toBe(false);
      expect(result.shouldEnforce).toBe(false);
    });

    it("enforces generic CW when autoHideAllCW is true", () => {
      const prefs: SpoilerPreferences = {
        autoHideUnread: true,
        autoHideAllCW: true,
        showForReadBooks: true,
        showForDNF: false
      };
      const result = evaluateSpoiler("trigger warning", noopLookup, prefs);
      expect(result.isGenericCW).toBe(true);
      expect(result.shouldEnforce).toBe(true);
    });

    it("enforces book spoiler when book is unread (unknown status)", () => {
      const result = evaluateSpoiler("Spoilers for Dune", noopLookup);
      expect(result.isBookSpoiler).toBe(true);
      expect(result.bookTitle).toBe("Dune");
      expect(result.shouldEnforce).toBe(true);
    });

    it("does not enforce when book is marked as read", () => {
      const lookup: ReadingStatusLookup = (title) =>
        title.toLowerCase() === "dune" ? "read" : undefined;

      const prefs: SpoilerPreferences = {
        autoHideUnread: true,
        autoHideAllCW: false,
        showForReadBooks: true,
        showForDNF: false
      };
      const result = evaluateSpoiler("Spoilers for Dune", lookup, prefs);
      expect(result.isBookSpoiler).toBe(true);
      expect(result.shouldEnforce).toBe(false);
      expect(result.reason).toContain("already read");
    });

    it("enforces when book is in 'reading' status", () => {
      const lookup: ReadingStatusLookup = (title) =>
        title.toLowerCase() === "dune" ? "reading" : undefined;

      const result = evaluateSpoiler("Contains spoilers for Dune", lookup);
      expect(result.isBookSpoiler).toBe(true);
      expect(result.shouldEnforce).toBe(true);
      expect(result.reason).toContain("reading");
    });

    it("enforces when book is in 'want-to-read' status", () => {
      const lookup: ReadingStatusLookup = (title) =>
        title.toLowerCase() === "dune" ? "want-to-read" : undefined;

      const result = evaluateSpoiler("Spoilers for Dune", lookup);
      expect(result.isBookSpoiler).toBe(true);
      expect(result.shouldEnforce).toBe(true);
    });

    it("enforces for did-not-finish when showForDNF is false", () => {
      const lookup: ReadingStatusLookup = () => "did-not-finish";
      const prefs: SpoilerPreferences = {
        autoHideUnread: true,
        autoHideAllCW: false,
        showForReadBooks: true,
        showForDNF: false
      };
      const result = evaluateSpoiler("Spoilers for Dune", lookup, prefs);
      expect(result.shouldEnforce).toBe(true);
    });

    it("does not enforce for did-not-finish when showForDNF is true", () => {
      const lookup: ReadingStatusLookup = () => "did-not-finish";
      const prefs: SpoilerPreferences = {
        autoHideUnread: true,
        autoHideAllCW: false,
        showForReadBooks: true,
        showForDNF: true
      };
      const result = evaluateSpoiler("Spoilers for Dune", lookup, prefs);
      expect(result.shouldEnforce).toBe(false);
    });

    it("does not enforce book spoiler when autoHideUnread is disabled", () => {
      const prefs: SpoilerPreferences = {
        autoHideUnread: false,
        autoHideAllCW: false,
        showForReadBooks: true,
        showForDNF: false
      };
      const result = evaluateSpoiler("Spoilers for Dune", noopLookup, prefs);
      expect(result.isBookSpoiler).toBe(true);
      expect(result.shouldEnforce).toBe(false);
    });
  });

  describe("spoiler preferences", () => {
    it("loads default preferences when none saved", () => {
      const prefs = loadSpoilerPreferences();
      expect(prefs.autoHideUnread).toBe(true);
      expect(prefs.autoHideAllCW).toBe(false);
      expect(prefs.showForReadBooks).toBe(true);
      expect(prefs.showForDNF).toBe(false);
    });

    it("saves and loads preferences", () => {
      const prefs: SpoilerPreferences = {
        autoHideUnread: false,
        autoHideAllCW: true,
        showForReadBooks: false,
        showForDNF: true
      };
      saveSpoilerPreferences(prefs);
      const loaded = loadSpoilerPreferences();
      expect(loaded).toEqual(prefs);
    });

    it("handles invalid stored JSON gracefully", () => {
      mockStorage.set("ryu:spoiler-preferences", "invalid json");
      const prefs = loadSpoilerPreferences();
      expect(prefs.autoHideUnread).toBe(true);
    });
  });

  describe("createLocalStorageReadingStatusLookup", () => {
    it("returns undefined for unknown books", () => {
      const lookup = createLocalStorageReadingStatusLookup();
      expect(lookup("Unknown Book")).toBeUndefined();
    });

    it("finds reading status by title match in keys", () => {
      mockStorage.set("ryu.reading-status.dune", "read");
      const lookup = createLocalStorageReadingStatusLookup();
      expect(lookup("Dune")).toBe("read");
    });

    it("finds reading status by partial key match", () => {
      mockStorage.set("ryu.reading-status.the-name-of-the-wind", "reading");
      const lookup = createLocalStorageReadingStatusLookup();
      // The lookup normalizes and searches for containment
      expect(lookup("the-name-of-the-wind")).toBe("reading");
    });

    it("returns undefined for invalid stored values", () => {
      mockStorage.set("ryu.reading-status.dune", "invalid-status");
      const lookup = createLocalStorageReadingStatusLookup();
      expect(lookup("Dune")).toBeUndefined();
    });
  });
});
