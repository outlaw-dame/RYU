import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SearchDocument, RankedSearchResult } from "../../types";
import type { HybridSearchResponse, LocalHybridSearchEngine } from "../hybridSearchTypes";

// Mock dependencies
vi.mock("../../search", () => ({
  searchAll: vi.fn()
}));

vi.mock("../../orama", () => ({
  searchOrama: vi.fn()
}));

vi.mock("../../vector-index", () => ({
  indexDocument: vi.fn(),
  semanticSearchLocal: vi.fn(),
  clearInMemoryVectorIndex: vi.fn()
}));

vi.mock("../../index-lifecycle", () => ({
  inspectSearchIndexHealth: vi.fn(),
  repairSearchIndexHealth: vi.fn(),
  rebuildSearchVectorsForCurrentProvider: vi.fn()
}));

vi.mock("../../embedding-provider", () => ({
  getEmbeddingProvider: vi.fn(() => ({
    id: "deterministic",
    dimensions: 64,
    embed: vi.fn()
  }))
}));

vi.mock("../../query-normalize", () => ({
  normalizeSearchQuery: vi.fn((q: string) => q.trim().toLowerCase())
}));

vi.mock("../../../db/client", () => ({
  initializeDatabase: vi.fn(),
  DEFAULT_RYU_DATABASE_NAME: "ryu"
}));

import { searchAll } from "../../search";
import { searchOrama } from "../../orama";
import { indexDocument as vectorIndexDocument, semanticSearchLocal, clearInMemoryVectorIndex } from "../../vector-index";
import { inspectSearchIndexHealth, repairSearchIndexHealth, rebuildSearchVectorsForCurrentProvider } from "../../index-lifecycle";
import { createRxDbOramaHybridSearchEngine } from "../RxDbOramaHybridSearchEngine";

const mockSearchAll = vi.mocked(searchAll);
const mockSearchOrama = vi.mocked(searchOrama);
const mockSemanticSearch = vi.mocked(semanticSearchLocal);
const mockVectorIndex = vi.mocked(vectorIndexDocument);
const mockClearVectors = vi.mocked(clearInMemoryVectorIndex);
const mockInspect = vi.mocked(inspectSearchIndexHealth);
const mockRepair = vi.mocked(repairSearchIndexHealth);
const mockRebuild = vi.mocked(rebuildSearchVectorsForCurrentProvider);

describe("RxDbOramaHybridSearchEngine", () => {
  let engine: LocalHybridSearchEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = createRxDbOramaHybridSearchEngine();
  });

  describe("search", () => {
    it("returns null results for queries shorter than 2 chars", async () => {
      const response = await engine.search({ query: "a" });

      expect(response.results).toBeNull();
      expect(response.diagnostics.lexicalCount).toBe(0);
      expect(response.diagnostics.semanticCount).toBe(0);
      expect(response.diagnostics.usedSemantic).toBe(false);
    });

    it("returns grouped results with diagnostics for valid queries", async () => {
      const lexicalResults: RankedSearchResult[] = [
        makeResult("1", "Dune", 0.9),
        makeResult("2", "Dune Messiah", 0.7)
      ];
      const semanticResults: RankedSearchResult[] = [
        makeResult("3", "Foundation", 0.6)
      ];
      const groupedResults = {
        all: [...lexicalResults, ...semanticResults],
        editions: [],
        works: [...lexicalResults, ...semanticResults],
        authors: []
      };

      mockSearchOrama.mockResolvedValue(lexicalResults);
      mockSemanticSearch.mockResolvedValue(semanticResults);
      mockSearchAll.mockResolvedValue(groupedResults as any);

      const response = await engine.search({ query: "dune" });

      expect(response.query).toBe("dune");
      expect(response.normalizedQuery).toBe("dune");
      expect(response.results).toBe(groupedResults);
      expect(response.diagnostics.lexicalCount).toBe(2);
      expect(response.diagnostics.semanticCount).toBe(1);
      expect(response.diagnostics.usedSemantic).toBe(true);
      expect(response.diagnostics.providerId).toBe("deterministic");
      expect(response.diagnostics.providerDimensions).toBe(64);
      expect(response.diagnostics.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("degrades gracefully when semantic search fails", async () => {
      const lexicalResults: RankedSearchResult[] = [
        makeResult("1", "Dune", 0.9)
      ];
      const groupedResults = {
        all: lexicalResults,
        editions: [],
        works: lexicalResults,
        authors: []
      };

      mockSearchOrama.mockResolvedValue(lexicalResults);
      mockSemanticSearch.mockRejectedValue(new Error("model not loaded"));
      mockSearchAll.mockResolvedValue(groupedResults as any);

      const response = await engine.search({ query: "dune" });

      expect(response.results).toBe(groupedResults);
      expect(response.diagnostics.semanticCount).toBe(0);
      expect(response.diagnostics.usedSemantic).toBe(false);
    });

    it("degrades gracefully when lexical search fails", async () => {
      const semanticResults: RankedSearchResult[] = [
        makeResult("1", "Dune", 0.8)
      ];
      const groupedResults = {
        all: semanticResults,
        editions: [],
        works: semanticResults,
        authors: []
      };

      mockSearchOrama.mockRejectedValue(new Error("orama init failed"));
      mockSemanticSearch.mockResolvedValue(semanticResults);
      mockSearchAll.mockResolvedValue(groupedResults as any);

      const response = await engine.search({ query: "desert ecology" });

      expect(response.results).toBe(groupedResults);
      expect(response.diagnostics.lexicalCount).toBe(0);
      expect(response.diagnostics.usedSemantic).toBe(true);
    });

    it("passes options through to searchAll", async () => {
      mockSearchOrama.mockResolvedValue([]);
      mockSemanticSearch.mockResolvedValue([]);
      mockSearchAll.mockResolvedValue(null);

      await engine.search({
        query: "test",
        limit: 10,
        options: { context: { surface: "library" } }
      });

      expect(mockSearchAll).toHaveBeenCalledWith("test", expect.objectContaining({
        limit: 10,
        context: { surface: "library" }
      }));
    });
  });

  describe("indexDocument", () => {
    it("delegates to vector-index indexDocument", async () => {
      const doc = makeSearchDocument("1", "Dune");
      await engine.indexDocument(doc);

      expect(mockVectorIndex).toHaveBeenCalledWith(doc, undefined);
    });
  });

  describe("rebuild", () => {
    it("clears in-memory vectors and rebuilds from current provider", async () => {
      await engine.rebuild();

      expect(mockClearVectors).toHaveBeenCalled();
      expect(mockRebuild).toHaveBeenCalled();
    });
  });

  describe("inspectHealth", () => {
    it("delegates to index-lifecycle inspectSearchIndexHealth", async () => {
      const healthResult = {
        searchableDocuments: 100,
        vectorsForCurrentProvider: 95,
        vectorsForOtherProviders: 10,
        missingVectors: 5,
        staleVectors: 0,
        invalidVectors: 0,
        orphanVectors: 2,
        healthy: true,
        checkedAt: "2026-06-15T00:00:00Z"
      };
      mockInspect.mockResolvedValue(healthResult);

      const result = await engine.inspectHealth();

      expect(result).toBe(healthResult);
      expect(mockInspect).toHaveBeenCalled();
    });
  });

  describe("repair", () => {
    it("delegates to index-lifecycle repairSearchIndexHealth", async () => {
      await engine.repair();

      expect(mockRepair).toHaveBeenCalled();
    });
  });
});

function makeResult(id: string, title: string, score: number): RankedSearchResult {
  return {
    id,
    type: "work",
    title,
    description: "",
    authorText: "",
    isbnText: "",
    enrichmentText: "",
    source: "local",
    updatedAt: "2026-01-01T00:00:00Z",
    score
  };
}

function makeSearchDocument(id: string, title: string): SearchDocument {
  return {
    id,
    type: "work",
    title,
    description: `A book called ${title}`,
    authorText: "Author Name",
    isbnText: "",
    enrichmentText: "",
    source: "local",
    updatedAt: "2026-01-01T00:00:00Z"
  };
}
