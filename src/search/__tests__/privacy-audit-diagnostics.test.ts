/**
 * Phase 13 — Diagnostics metadata leakage test.
 *
 * Adversarial test proving that searchAllWithDiagnostics does NOT report
 * pre-scope-filter counts. A side-channel that revealed how many private
 * documents matched a global query would let an attacker enumerate
 * private content existence by query — a metadata-leakage vulnerability.
 *
 * This file uses vi.mock at module scope to inject controlled lexical
 * and semantic results so we can assert the diagnostics object.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RankedSearchResult, SearchDocumentScope } from "../types";

// Mock low-level retrieval. The real fusion/dedupe/scope-filter pipeline runs.
vi.mock("../orama", () => ({
  searchOrama: vi.fn()
}));

vi.mock("../vector-index", () => ({
  semanticSearchLocal: vi.fn()
}));

// Keep intent classification deterministic so adaptiveAlpha is stable.
vi.mock("../intent", () => ({
  classifyQueryIntent: vi.fn(() => ({
    intent: "lexical",
    alpha: 0.6,
    preferredTypes: {}
  }))
}));

vi.mock("../intent-llm", () => ({
  refineIntentWithLLM: vi.fn(async (_q: string, intent: unknown) => intent)
}));

vi.mock("../weights", () => ({
  getAdaptiveAlpha: vi.fn(() => 0.6)
}));

// Skip query expansion side effects (no DB).
vi.mock("../query-expansion", () => ({
  buildSearchQueryExpansionPlan: vi.fn(async (q: string) => ({
    normalizedQuery: q,
    semanticQuery: q,
    expansionTerms: []
  }))
}));

// Reranker disabled so we don't have to mock provider plumbing.
vi.mock("../reranker-provider", () => ({
  getRerankerProvider: vi.fn(() => null)
}));

vi.mock("../preferences", () => ({
  getSearchPreferences: vi.fn(() => ({ preferredTypes: {} }))
}));

// Feedback boosts and exploration are no-ops for this test.
vi.mock("../feedback-ranking", () => ({
  applyFeedbackBoosts: vi.fn((_q: string, results: unknown[]) => results)
}));

vi.mock("../exploration", () => ({
  applyExploration: vi.fn((results: unknown[]) => results)
}));

import { searchOrama } from "../orama";
import { semanticSearchLocal } from "../vector-index";
import { searchAllWithDiagnostics } from "../search";

const mockSearchOrama = vi.mocked(searchOrama);
const mockSemanticSearchLocal = vi.mocked(semanticSearchLocal);

function makeRanked(
  id: string,
  scope: SearchDocumentScope,
  ownerId: string | undefined,
  score: number
): RankedSearchResult {
  return {
    id,
    type: "work",
    title: `Doc ${id}`,
    description: "",
    authorText: "Author",
    isbnText: "",
    enrichmentText: "",
    source: "local",
    scope,
    ownerId,
    updatedAt: "2026-01-01T00:00:00Z",
    score,
    lexicalScore: score
  };
}

describe("Search diagnostics metadata leakage", () => {
  beforeEach(() => {
    mockSearchOrama.mockReset();
    mockSemanticSearchLocal.mockReset();
  });

  it("lexicalCount/semanticCount do NOT include private docs on global surface", async () => {
    // Lexical bucket: 1 public + 2 private (matching the query).
    mockSearchOrama.mockResolvedValue([
      makeRanked("pub-1", "public", undefined, 0.9),
      makeRanked("priv-1", "private", "user-1", 0.8),
      makeRanked("priv-2", "private", "user-2", 0.7)
    ]);

    // Semantic bucket: 1 public + 1 private + 1 local-only.
    mockSemanticSearchLocal.mockResolvedValue([
      makeRanked("pub-1", "public", undefined, 0.85),
      makeRanked("priv-3", "private", "user-1", 0.6),
      makeRanked("local-1", "local-only", "user-1", 0.5)
    ]);

    const result = await searchAllWithDiagnostics("dune", {
      context: { surface: "global" }
    });

    // Diagnostics must reflect post-scope-filter counts only.
    // Lexical originally had 3 (1 pub + 2 priv) — global surface drops both privates.
    expect(result.diagnostics.lexicalCount).toBe(1);
    // Semantic originally had 3 (1 pub + 1 priv + 1 local-only) — global drops priv + local.
    expect(result.diagnostics.semanticCount).toBe(1);
    // usedSemantic must be derived from the post-scope semantic count.
    expect(result.diagnostics.usedSemantic).toBe(true);
    // finalCount only includes visible docs.
    expect(result.diagnostics.finalCount).toBeGreaterThan(0);
    expect(result.grouped?.all.find(r => r.scope === "private")).toBeUndefined();
    expect(result.grouped?.all.find(r => r.scope === "local-only")).toBeUndefined();
  });

  it("usedSemantic is false when ALL semantic hits are filtered by scope", async () => {
    mockSearchOrama.mockResolvedValue([
      makeRanked("pub-1", "public", undefined, 0.9)
    ]);

    // Every semantic hit is private — none survive the scope filter on global.
    mockSemanticSearchLocal.mockResolvedValue([
      makeRanked("priv-only-1", "private", "user-1", 0.8),
      makeRanked("priv-only-2", "private", "user-2", 0.7),
      makeRanked("local-only-1", "local-only", "user-1", 0.6)
    ]);

    const result = await searchAllWithDiagnostics("secret query", {
      context: { surface: "global" }
    });

    expect(result.diagnostics.semanticCount).toBe(0);
    // CRITICAL: must be false, otherwise an attacker can detect that
    // private/local-only docs matched the query.
    expect(result.diagnostics.usedSemantic).toBe(false);
  });

  it("library surface with matching owner counts include the user's own private docs", async () => {
    mockSearchOrama.mockResolvedValue([
      makeRanked("pub-1", "public", undefined, 0.9),
      makeRanked("my-priv", "private", "user-1", 0.8),
      makeRanked("other-priv", "private", "user-2", 0.7)
    ]);
    mockSemanticSearchLocal.mockResolvedValue([]);

    const result = await searchAllWithDiagnostics("notes", {
      context: { surface: "library", currentUserId: "user-1" }
    });

    // user-1 sees their own private doc (2 visible), but never user-2's.
    expect(result.diagnostics.lexicalCount).toBe(2);
    expect(result.grouped?.all.find(r => r.id === "other-priv")).toBeUndefined();
  });

  it("cache-only documents never count toward diagnostics on any surface", async () => {
    mockSearchOrama.mockResolvedValue([
      makeRanked("pub-1", "public", undefined, 0.9),
      makeRanked("cache-1", "cache-only", "remote-user", 0.85)
    ]);
    mockSemanticSearchLocal.mockResolvedValue([]);

    for (const surface of ["global", "library", "shelf", "entity"] as const) {
      mockSearchOrama.mockResolvedValueOnce([
        makeRanked("pub-1", "public", undefined, 0.9),
        makeRanked("cache-1", "cache-only", "remote-user", 0.85)
      ]);
      mockSemanticSearchLocal.mockResolvedValueOnce([]);

      const result = await searchAllWithDiagnostics("anything", {
        context: { surface, currentUserId: "user-1" }
      });

      expect(result.diagnostics.lexicalCount).toBe(1);
      expect(result.grouped?.all.find(r => r.scope === "cache-only")).toBeUndefined();
    }
  });
});
