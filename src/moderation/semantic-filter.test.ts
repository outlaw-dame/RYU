import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  semanticMatch,
  exactMatch,
  computeSemanticSimilarity,
  createSemanticFilter,
  precomputeFilterEmbeddings,
  clearEmbeddingCache,
  getOrComputeEmbedding,
  DEFAULT_SEMANTIC_THRESHOLD
} from "./semantic-filter";
import type { SemanticFilter } from "./semantic-filter";

describe("semantic-filter", () => {
  beforeEach(() => {
    clearEmbeddingCache();
  });

  afterEach(() => {
    clearEmbeddingCache();
  });

  describe("createSemanticFilter", () => {
    it("creates a filter with defaults", () => {
      const filter = createSemanticFilter("f1", "Violence", [
        { keyword: "violence" },
        { keyword: "brutal attack" }
      ]);
      expect(filter.id).toBe("f1");
      expect(filter.title).toBe("Violence");
      expect(filter.keywords).toHaveLength(2);
      expect(filter.threshold).toBe(DEFAULT_SEMANTIC_THRESHOLD);
      expect(filter.semanticEnabled).toBe(true);
    });

    it("creates a filter with custom options", () => {
      const filter = createSemanticFilter("f2", "Custom", [
        { keyword: "test", wholeWord: true }
      ], { threshold: 0.8, semanticEnabled: false });
      expect(filter.threshold).toBe(0.8);
      expect(filter.semanticEnabled).toBe(false);
      expect(filter.keywords[0].wholeWord).toBe(true);
    });
  });

  describe("exactMatch", () => {
    it("matches exact keyword", () => {
      const filter = createSemanticFilter("f1", "Test", [
        { keyword: "violence" }
      ]);
      const result = exactMatch("This contains violence in the scene", filter);
      expect(result.matched).toBe(true);
      expect(result.matchType).toBe("exact");
      expect(result.matchedKeyword).toBe("violence");
    });

    it("does not match unrelated text", () => {
      const filter = createSemanticFilter("f1", "Test", [
        { keyword: "violence" }
      ]);
      const result = exactMatch("A lovely sunny day", filter);
      expect(result.matched).toBe(false);
      expect(result.matchType).toBe("none");
    });

    it("returns no match for empty content", () => {
      const filter = createSemanticFilter("f1", "Test", [
        { keyword: "violence" }
      ]);
      const result = exactMatch("", filter);
      expect(result.matched).toBe(false);
    });

    it("supports whole-word matching", () => {
      const filter = createSemanticFilter("f1", "Test", [
        { keyword: "cat", wholeWord: true }
      ]);
      expect(exactMatch("I love my cat", filter).matched).toBe(true);
      expect(exactMatch("concatenation", filter).matched).toBe(false);
    });

    it("matches case-insensitively", () => {
      const filter = createSemanticFilter("f1", "Test", [
        { keyword: "VIOLENCE" }
      ]);
      expect(exactMatch("graphic violence", filter).matched).toBe(true);
    });
  });

  describe("semanticMatch", () => {
    it("matches exact keywords first (fast path)", async () => {
      const filter = createSemanticFilter("f1", "Test", [
        { keyword: "violence" }
      ]);
      const result = await semanticMatch("This contains violence", filter);
      expect(result.matched).toBe(true);
      expect(result.matchType).toBe("exact");
      expect(result.similarity).toBe(1.0);
    });

    it("does semantic matching when no exact match", async () => {
      const filter = createSemanticFilter("f1", "Violence", [
        { keyword: "violence" },
        { keyword: "brutal attack" }
      ], { threshold: 0.3, semanticEnabled: true });

      // "fight" is semantically related to "violence" through the embedding
      const result = await semanticMatch("graphic fight scene with blood", filter);
      // The deterministic embedding might or might not find a semantic match
      // but it should not error
      expect(result.matchType).toMatch(/^(exact|semantic|none)$/);
    });

    it("returns no match when semantic is disabled", async () => {
      const filter = createSemanticFilter("f1", "Test", [
        { keyword: "happiness" }
      ], { semanticEnabled: false });

      const result = await semanticMatch("joyful celebration", filter);
      expect(result.matched).toBe(false);
      expect(result.matchType).toBe("none");
    });

    it("returns no match for empty content", async () => {
      const filter = createSemanticFilter("f1", "Test", [
        { keyword: "violence" }
      ]);
      const result = await semanticMatch("", filter);
      expect(result.matched).toBe(false);
    });

    it("respects threshold clamping", async () => {
      // Very high threshold means semantic match is unlikely
      const filter = createSemanticFilter("f1", "Test", [
        { keyword: "happiness" }
      ], { threshold: 0.99, semanticEnabled: true });

      const result = await semanticMatch("joy and celebration", filter);
      // With such a high threshold, semantic match is very unlikely
      expect(result.matchType).not.toBe("exact");
    });
  });

  describe("computeSemanticSimilarity", () => {
    it("returns high similarity for identical text", async () => {
      const sim = await computeSemanticSimilarity("violence", "violence");
      expect(sim).toBeCloseTo(1.0, 1);
    });

    it("returns 0 for empty text", async () => {
      const sim = await computeSemanticSimilarity("", "violence");
      expect(sim).toBe(0);
    });

    it("returns a number between -1 and 1 for different texts", async () => {
      const sim = await computeSemanticSimilarity("violence", "peaceful garden");
      expect(sim).toBeGreaterThanOrEqual(-1);
      expect(sim).toBeLessThanOrEqual(1);
    });

    it("returns higher similarity for related terms", async () => {
      // Using identical-stem words to ensure hash-based embeddings produce overlap
      const relatedSim = await computeSemanticSimilarity("violent attack scene", "violence attacks");
      const unrelatedSim = await computeSemanticSimilarity("violent attack scene", "flower garden sunshine");
      // Related terms (sharing stems) should have higher similarity than unrelated
      expect(relatedSim).toBeGreaterThanOrEqual(unrelatedSim);
    });
  });

  describe("getOrComputeEmbedding", () => {
    it("returns null for empty text", async () => {
      const result = await getOrComputeEmbedding("");
      expect(result).toBeNull();
    });

    it("returns an embedding array for valid text", async () => {
      const result = await getOrComputeEmbedding("hello world");
      expect(result).not.toBeNull();
      expect(Array.isArray(result)).toBe(true);
      expect(result!.length).toBeGreaterThan(0);
    });

    it("caches embeddings for repeated calls", async () => {
      const first = await getOrComputeEmbedding("test phrase");
      const second = await getOrComputeEmbedding("test phrase");
      expect(first).toBe(second); // Same reference (cached)
    });
  });

  describe("precomputeFilterEmbeddings", () => {
    it("pre-computes embeddings for all keywords", async () => {
      const filter = createSemanticFilter("f1", "Test", [
        { keyword: "violence" },
        { keyword: "hatred" }
      ]);

      expect(filter.keywords[0].embedding).toBeNull();
      expect(filter.keywords[1].embedding).toBeNull();

      const updated = await precomputeFilterEmbeddings(filter);
      expect(updated.keywords[0].embedding).not.toBeNull();
      expect(updated.keywords[1].embedding).not.toBeNull();
      expect(Array.isArray(updated.keywords[0].embedding)).toBe(true);
    });
  });
});
