import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("@/db/client", () => ({
  initializeDatabase: vi.fn()
}));

// Mock reading status
vi.mock("@/hooks/useLibrary", () => ({
  getReadingStatus: vi.fn(() => undefined)
}));

import { extractTitleKeywords, titleSimilarity } from "../related-books";

describe("related-books utilities", () => {
  describe("extractTitleKeywords", () => {
    it("extracts meaningful keywords from a title", () => {
      const keywords = extractTitleKeywords("The Lord of the Rings");
      expect(keywords).toContain("lord");
      expect(keywords).toContain("rings");
      expect(keywords).not.toContain("the");
      expect(keywords).not.toContain("of");
    });

    it("removes punctuation", () => {
      const keywords = extractTitleKeywords("Harry Potter: A New Beginning");
      expect(keywords).toContain("harry");
      expect(keywords).toContain("potter");
      expect(keywords).toContain("new");
      expect(keywords).toContain("beginning");
    });

    it("removes short tokens", () => {
      const keywords = extractTitleKeywords("A is for Alibi");
      expect(keywords).not.toContain("is");
      expect(keywords).not.toContain("a");
      expect(keywords).toContain("alibi");
    });

    it("returns empty array for empty string", () => {
      expect(extractTitleKeywords("")).toEqual([]);
    });
  });

  describe("titleSimilarity", () => {
    it("returns 1.0 for identical titles", () => {
      expect(titleSimilarity("The Great Gatsby", "The Great Gatsby")).toBe(1);
    });

    it("returns 0 for completely different titles", () => {
      expect(titleSimilarity("Quantum Physics", "Chocolate Cake Recipe")).toBe(0);
    });

    it("returns a score between 0 and 1 for partial overlap", () => {
      const score = titleSimilarity(
        "Introduction to Machine Learning",
        "Machine Learning Algorithms"
      );
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it("returns 0 when one title produces no keywords", () => {
      expect(titleSimilarity("A", "The Great Gatsby")).toBe(0);
    });
  });
});
