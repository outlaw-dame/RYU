import { describe, it, expect } from "vitest";
import { isScopeVisibleOnSurface, filterResultsByScope } from "../scope-filter";
import type { RankedSearchResult, SearchDocumentScope, SearchSurface } from "../types";

function makeResult(id: string, scope?: SearchDocumentScope): RankedSearchResult {
  return {
    id,
    type: "work",
    title: `Book ${id}`,
    description: "",
    authorText: "",
    isbnText: "",
    enrichmentText: "",
    source: "local",
    scope,
    updatedAt: "2026-01-01T00:00:00Z",
    score: 1
  };
}

describe("isScopeVisibleOnSurface", () => {
  it("public documents are visible on all surfaces", () => {
    const surfaces: SearchSurface[] = ["global", "library", "shelf", "onboarding", "entity"];
    for (const surface of surfaces) {
      expect(isScopeVisibleOnSurface("public", surface)).toBe(true);
    }
  });

  it("followers-scoped documents are visible on all surfaces", () => {
    expect(isScopeVisibleOnSurface("followers", "global")).toBe(true);
    expect(isScopeVisibleOnSurface("followers", "library")).toBe(true);
  });

  it("private documents are only visible in library and shelf surfaces", () => {
    expect(isScopeVisibleOnSurface("private", "library")).toBe(true);
    expect(isScopeVisibleOnSurface("private", "shelf")).toBe(true);
    expect(isScopeVisibleOnSurface("private", "global")).toBe(false);
    expect(isScopeVisibleOnSurface("private", "onboarding")).toBe(false);
    expect(isScopeVisibleOnSurface("private", "entity")).toBe(false);
  });

  it("local-only documents are only visible in library and shelf surfaces", () => {
    expect(isScopeVisibleOnSurface("local-only", "library")).toBe(true);
    expect(isScopeVisibleOnSurface("local-only", "shelf")).toBe(true);
    expect(isScopeVisibleOnSurface("local-only", "global")).toBe(false);
    expect(isScopeVisibleOnSurface("local-only", "entity")).toBe(false);
  });

  it("cache-only documents are never searchable", () => {
    expect(isScopeVisibleOnSurface("cache-only", "global")).toBe(false);
    expect(isScopeVisibleOnSurface("cache-only", "library")).toBe(false);
    expect(isScopeVisibleOnSurface("cache-only", "shelf")).toBe(false);
  });

  it("undefined scope defaults to public (visible everywhere)", () => {
    expect(isScopeVisibleOnSurface(undefined, "global")).toBe(true);
    expect(isScopeVisibleOnSurface(undefined, "library")).toBe(true);
  });

  it("undefined surface defaults to global", () => {
    expect(isScopeVisibleOnSurface("private", undefined)).toBe(false);
    expect(isScopeVisibleOnSurface("public", undefined)).toBe(true);
  });
});

describe("filterResultsByScope", () => {
  it("filters private results from global surface", () => {
    const results = [
      makeResult("pub-1", "public"),
      makeResult("priv-1", "private"),
      makeResult("local-1", "local-only"),
      makeResult("pub-2", "public")
    ];

    const filtered = filterResultsByScope(results, { surface: "global" });

    expect(filtered.map((r) => r.id)).toEqual(["pub-1", "pub-2"]);
  });

  it("shows private results on library surface", () => {
    const results = [
      makeResult("pub-1", "public"),
      makeResult("priv-1", "private"),
      makeResult("local-1", "local-only")
    ];

    const filtered = filterResultsByScope(results, { surface: "library" });

    expect(filtered.map((r) => r.id)).toEqual(["pub-1", "priv-1", "local-1"]);
  });

  it("excludes cache-only from all surfaces", () => {
    const results = [
      makeResult("pub-1", "public"),
      makeResult("cached-1", "cache-only")
    ];

    const filtered = filterResultsByScope(results, { surface: "library" });

    expect(filtered.map((r) => r.id)).toEqual(["pub-1"]);
  });

  it("defaults to global surface when no context is provided", () => {
    const results = [
      makeResult("pub-1", "public"),
      makeResult("priv-1", "private")
    ];

    const filtered = filterResultsByScope(results);

    expect(filtered.map((r) => r.id)).toEqual(["pub-1"]);
  });

  it("preserves all results when all are public", () => {
    const results = [
      makeResult("a", "public"),
      makeResult("b", "public"),
      makeResult("c") // undefined scope = public
    ];

    const filtered = filterResultsByScope(results, { surface: "global" });

    expect(filtered.length).toBe(3);
  });
});
