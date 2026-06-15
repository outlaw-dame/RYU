import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RankedSearchResult } from "../../types";
import type { ProgressiveSearchUpdate } from "../progressiveSearch";

// Mock dependencies before importing the module under test
vi.mock("../../orama", () => ({
  searchOrama: vi.fn()
}));

vi.mock("../../vector-index", () => ({
  semanticSearchLocal: vi.fn()
}));

vi.mock("../../intent", () => ({
  classifyQueryIntent: vi.fn(() => ({ intent: "lexical", alpha: 0.6, preferredTypes: {} }))
}));

vi.mock("../../intent-llm", () => ({
  refineIntentWithLLM: vi.fn(async (_q: string, intent: unknown) => intent)
}));

vi.mock("../../weights", () => ({
  getAdaptiveAlpha: vi.fn(() => 0.6)
}));

vi.mock("../../preferences", () => ({
  getSearchPreferences: vi.fn(() => ({ preferredTypes: {} }))
}));

vi.mock("../../reranker-provider", () => ({
  getRerankerProvider: vi.fn(() => null)
}));

vi.mock("../../query-normalize", () => ({
  normalizeSearchQuery: vi.fn((q: string) => q.trim().toLowerCase())
}));

vi.mock("../../query-expansion", () => ({
  buildSearchQueryExpansionPlan: vi.fn(async (q: string) => ({
    normalizedQuery: q,
    semanticQuery: q
  }))
}));

vi.mock("../../embedding-provider", () => ({
  getEmbeddingProvider: vi.fn(() => ({ id: "deterministic", dimensions: 64, embed: vi.fn() }))
}));

vi.mock("../../ranking", () => ({
  fuseResults: vi.fn((lex: RankedSearchResult[], sem: RankedSearchResult[]) => [...lex, ...sem]),
  dedupe: vi.fn((items: RankedSearchResult[]) => items)
}));

vi.mock("../../context-ranking", () => ({
  applyContextBoosts: vi.fn((items: RankedSearchResult[]) => items)
}));

vi.mock("../../feedback-ranking", () => ({
  applyFeedbackBoosts: vi.fn((_q: string, items: RankedSearchResult[]) => items)
}));

vi.mock("../../rerank", () => ({
  rerankResults: vi.fn((items: RankedSearchResult[]) => items)
}));

vi.mock("../../exploration", () => ({
  applyExploration: vi.fn((items: RankedSearchResult[]) => items)
}));

vi.mock("../../explain", () => ({
  attachExplanations: vi.fn((items: RankedSearchResult[]) => items)
}));

vi.mock("../../group", () => ({
  groupResults: vi.fn((items: RankedSearchResult[]) => ({
    all: items,
    editions: [],
    works: items,
    authors: []
  }))
}));

import { searchOrama } from "../../orama";
import { semanticSearchLocal } from "../../vector-index";
import { searchProgressively } from "../progressiveSearch";

const mockSearchOrama = vi.mocked(searchOrama);
const mockSemanticSearch = vi.mocked(semanticSearchLocal);

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

describe("searchProgressively", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits lexical → semantic → fused → complete in order", async () => {
    const lex = [makeResult("L1", "Lex result", 0.9)];
    const sem = [makeResult("S1", "Sem result", 0.7)];
    mockSearchOrama.mockResolvedValue(lex);
    mockSemanticSearch.mockResolvedValue(sem);

    const updates: ProgressiveSearchUpdate[] = [];
    const response = await searchProgressively({ query: "test" }, (u) => updates.push(u));

    const stages = updates.map((u) => u.stage);
    expect(stages).toEqual(["lexical", "semantic", "fused", "complete"]);

    const completeUpdate = updates[3];
    if (completeUpdate.stage !== "complete") throw new Error("expected complete");
    expect(completeUpdate.response.diagnostics.lexicalCount).toBe(1);
    expect(completeUpdate.response.diagnostics.semanticCount).toBe(1);
    expect(completeUpdate.response.diagnostics.usedSemantic).toBe(true);
    expect(response).toBe(completeUpdate.response);
  });

  it("returns a null-results empty response for short queries", async () => {
    const updates: ProgressiveSearchUpdate[] = [];
    const response = await searchProgressively({ query: "a" }, (u) => updates.push(u));

    expect(response.results).toBeNull();
    expect(updates).toHaveLength(1);
    expect(updates[0].stage).toBe("complete");
    expect(mockSearchOrama).not.toHaveBeenCalled();
    expect(mockSemanticSearch).not.toHaveBeenCalled();
  });

  it("falls back to lexical-only when semantic search fails", async () => {
    const lex = [makeResult("L1", "Lex only", 0.9)];
    mockSearchOrama.mockResolvedValue(lex);
    mockSemanticSearch.mockRejectedValue(new Error("model not loaded"));

    const updates: ProgressiveSearchUpdate[] = [];
    const response = await searchProgressively({ query: "test" }, (u) => updates.push(u));

    const stages = updates.map((u) => u.stage);
    expect(stages).toContain("lexical");
    expect(stages).toContain("error");
    expect(stages).toContain("fused");
    expect(stages[stages.length - 1]).toBe("complete");

    expect(response.diagnostics.semanticCount).toBe(0);
    expect(response.diagnostics.usedSemantic).toBe(false);
    expect(response.diagnostics.lexicalCount).toBe(1);

    const errorUpdate = updates.find((u) => u.stage === "error");
    if (errorUpdate?.stage !== "error") throw new Error("expected error update");
    expect(errorUpdate.error.stage).toBe("semantic");
    expect(errorUpdate.error.recoverable).toBe(true);
  });

  it("continues with semantic when lexical fails", async () => {
    const sem = [makeResult("S1", "Sem only", 0.8)];
    mockSearchOrama.mockRejectedValue(new Error("orama init failed"));
    mockSemanticSearch.mockResolvedValue(sem);

    const updates: ProgressiveSearchUpdate[] = [];
    const response = await searchProgressively({ query: "test" }, (u) => updates.push(u));

    const stages = updates.map((u) => u.stage);
    expect(stages).toContain("error");
    expect(stages).toContain("semantic");
    expect(stages[stages.length - 1]).toBe("complete");

    expect(response.diagnostics.lexicalCount).toBe(0);
    expect(response.diagnostics.semanticCount).toBe(1);
    expect(response.diagnostics.usedSemantic).toBe(true);

    const errorUpdate = updates.find((u) => u.stage === "error");
    if (errorUpdate?.stage !== "error") throw new Error("expected error update");
    expect(errorUpdate.error.stage).toBe("lexical");
  });

  it("never lets a listener exception break the pipeline", async () => {
    mockSearchOrama.mockResolvedValue([makeResult("L1", "x", 1)]);
    mockSemanticSearch.mockResolvedValue([]);

    const handler = vi.fn(() => {
      throw new Error("listener exploded");
    });

    await expect(searchProgressively({ query: "test" }, handler)).resolves.toBeDefined();
  });

  it("captures durationMs and provider info in the final response", async () => {
    mockSearchOrama.mockResolvedValue([]);
    mockSemanticSearch.mockResolvedValue([]);

    const response = await searchProgressively({ query: "test" }, () => undefined);

    expect(response.diagnostics.durationMs).toBeGreaterThanOrEqual(0);
    expect(response.diagnostics.providerId).toBe("deterministic");
    expect(response.diagnostics.providerDimensions).toBe(64);
  });

  it("emits the lexical update before semantic when semantic is slower", async () => {
    let semanticResolve: (value: RankedSearchResult[]) => void = () => undefined;
    const semanticPromise = new Promise<RankedSearchResult[]>((resolve) => {
      semanticResolve = resolve;
    });

    mockSearchOrama.mockResolvedValue([makeResult("L1", "fast", 0.9)]);
    mockSemanticSearch.mockReturnValue(semanticPromise);

    const updates: ProgressiveSearchUpdate[] = [];
    const finalPromise = searchProgressively({ query: "test" }, (u) => updates.push(u));

    // Resolve semantic only after we've had time to observe lexical.
    setTimeout(() => semanticResolve([makeResult("S1", "slow", 0.7)]), 10);
    await finalPromise;

    const lexicalIdx = updates.findIndex((u) => u.stage === "lexical");
    const semanticIdx = updates.findIndex((u) => u.stage === "semantic");
    expect(lexicalIdx).toBeGreaterThanOrEqual(0);
    expect(semanticIdx).toBeGreaterThan(lexicalIdx);
  });
});
