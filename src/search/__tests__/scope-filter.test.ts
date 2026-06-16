import { describe, it, expect } from "vitest";
import { isScopeVisibleOnSurface, filterResultsByScope } from "../scope-filter";
import type { RankedSearchResult, SearchDocumentScope, SearchSurface } from "../types";

function makeResult(id: string, scope?: SearchDocumentScope, ownerId?: string): RankedSearchResult {
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
    ownerId,
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

  it("private documents are only visible if the owner matches the current user", () => {
    expect(isScopeVisibleOnSurface("private", "library", "user-1", "user-1")).toBe(true);
    expect(isScopeVisibleOnSurface("private", "library", "user-1", "user-2")).toBe(false);
    expect(isScopeVisibleOnSurface("private", "library", "user-1", undefined)).toBe(false);
  });

  it("private documents without ownerId are visible (legacy/unowned data)", () => {
    expect(isScopeVisibleOnSurface("private", "library", undefined, "user-1")).toBe(true);
    expect(isScopeVisibleOnSurface("private", "library", undefined, undefined)).toBe(true);
  });

  it("local-only documents follow the same ownership rules as private", () => {
    expect(isScopeVisibleOnSurface("local-only", "library", "user-1", "user-1")).toBe(true);
    expect(isScopeVisibleOnSurface("local-only", "library", "user-1", "user-2")).toBe(false);
    expect(isScopeVisibleOnSurface("local-only", "global", "user-1", "user-1")).toBe(false);
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
      makeResult("priv-1", "private", "user-1"),
      makeResult("local-1", "local-only", "user-1"),
      makeResult("pub-2", "public")
    ];

    const filtered = filterResultsByScope(results, { surface: "global", currentUserId: "user-1" });

    expect(filtered.map((r) => r.id)).toEqual(["pub-1", "pub-2"]);
  });

  it("shows private results on library surface when owner matches", () => {
    const results = [
      makeResult("pub-1", "public"),
      makeResult("priv-1", "private", "user-1"),
      makeResult("local-1", "local-only", "user-1")
    ];

    const filtered = filterResultsByScope(results, { surface: "library", currentUserId: "user-1" });

    expect(filtered.map((r) => r.id)).toEqual(["pub-1", "priv-1", "local-1"]);
  });

  it("hides private results from other users even on library surface", () => {
    const results = [
      makeResult("pub-1", "public"),
      makeResult("priv-1", "private", "user-1"),
      makeResult("priv-2", "private", "user-2")
    ];

    const filtered = filterResultsByScope(results, { surface: "library", currentUserId: "user-1" });

    // user-1 sees their own private doc but not user-2's
    expect(filtered.map((r) => r.id)).toEqual(["pub-1", "priv-1"]);
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
      makeResult("priv-1", "private", "user-1")
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
