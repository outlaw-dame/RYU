import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SearchDocument, RankedSearchResult } from "../../types";
import type { LocalHybridSearchEngine } from "../hybridSearchTypes";

// Mock dependencies
vi.mock("../../search", () => ({
  searchAll: vi.fn(),
  searchAllWithDiagnostics: vi.fn()
}));

vi.mock("../../vector-index", () => ({
  indexDocument: vi.fn(),
  clearInMemoryVectorIndex: vi.fn(),
  clearPersistedVectorsForCurrentProvider: vi.fn(),
  removeFromInMemoryVectorIndex: vi.fn()
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
  initializeDatabase: vi.fn(() => Promise.resolve({
    searchvectors: {
      find: vi.fn(() => ({ exec: vi.fn(() => Promise.resolve([])) }))
    }
  }))
}));

import { searchAllWithDiagnostics } from "../../search";
import { indexDocument as vectorIndexDocument, clearInMemoryVectorIndex, clearPersistedVectorsForCurrentProvider, removeFromInMemoryVectorIndex } from "../../vector-index";
import { inspectSearchIndexHealth, repairSearchIndexHealth, rebuildSearchVectorsForCurrentProvider } from "../../index-lifecycle";
import { createRxDbOramaHybridSearchEngine } from "../RxDbOramaHybridSearchEngine";

const mockSearchAllWithDiagnostics = vi.mocked(searchAllWithDiagnostics);
const mockVectorIndex = vi.mocked(vectorIndexDocument);
const mockClearVectors = vi.mocked(clearInMemoryVectorIndex);
const mockClearPersisted = vi.mocked(clearPersistedVectorsForCurrentProvider);
const mockRemoveFromMemory = vi.mocked(removeFromInMemoryVectorIndex);
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
      const groupedResults = {
        all: [makeResult("1", "Dune", 0.9), makeResult("2", "Dune Messiah", 0.7)],
        editions: [],
        works: [makeResult("1", "Dune", 0.9), makeResult("2", "Dune Messiah", 0.7)],
        authors: []
      };

      mockSearchAllWithDiagnostics.mockResolvedValue({
        grouped: groupedResults as any,
        diagnostics: {
          lexicalCount: 2,
          semanticCount: 1,
          fusedCount: 3,
          finalCount: 2,
          usedSemantic: true
        }
      });

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

    it("returns null results when searchAllWithDiagnostics returns null grouped", async () => {
      mockSearchAllWithDiagnostics.mockResolvedValue({
        grouped: null,
        diagnostics: {
          lexicalCount: 0,
          semanticCount: 0,
          fusedCount: 0,
          finalCount: 0,
          usedSemantic: false
        }
      });

      const response = await engine.search({ query: "xyznonexistent" });

      expect(response.results).toBeNull();
      expect(response.diagnostics.finalCount).toBe(0);
    });

    it("passes options through to searchAllWithDiagnostics", async () => {
      mockSearchAllWithDiagnostics.mockResolvedValue({
        grouped: null,
        diagnostics: { lexicalCount: 0, semanticCount: 0, fusedCount: 0, finalCount: 0, usedSemantic: false }
      });

      await engine.search({
        query: "test",
        limit: 10,
        options: { context: { surface: "library" } }
      });

      expect(mockSearchAllWithDiagnostics).toHaveBeenCalledWith("test", expect.objectContaining({
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

  describe("removeDocument", () => {
    it("removes from in-memory vector index", async () => {
      await engine.removeDocument("doc-1");

      expect(mockRemoveFromMemory).toHaveBeenCalledWith("doc-1");
    });
  });

  describe("rebuild", () => {
    it("clears in-memory vectors, clears persisted, then rebuilds", async () => {
      await engine.rebuild();

      expect(mockClearVectors).toHaveBeenCalled();
      expect(mockClearPersisted).toHaveBeenCalled();
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
