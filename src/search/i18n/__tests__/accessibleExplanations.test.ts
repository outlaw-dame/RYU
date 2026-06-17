import { describe, expect, it } from "vitest";
import {
  buildAccessibleExplanation,
  buildSearchStatusAnnouncement
} from "../accessibleExplanations";

describe("buildAccessibleExplanation", () => {
  it("returns a short summary for title match", () => {
    const result = buildAccessibleExplanation(["title"], false, "edition");
    expect(result.summary).toBe("Book. Found by title match.");
    expect(result.primaryReason).toBe("title match");
    expect(result.usedSemantic).toBe(false);
  });

  it("includes AI note when semantic was used", () => {
    const result = buildAccessibleExplanation(["semantic"], true, "work");
    expect(result.summary).toContain("Enhanced by AI");
    expect(result.usedSemantic).toBe(true);
  });

  it("uses the first reason as primary", () => {
    const result = buildAccessibleExplanation(["isbn", "title"], false, "edition");
    expect(result.primaryReason).toBe("ISBN match");
  });

  it("handles empty reasons array", () => {
    const result = buildAccessibleExplanation([], false, "author");
    expect(result.summary).toBe("Author. Found by search.");
    expect(result.primaryReason).toBe("search match");
  });

  it("handles empty reasons with usedSemantic=true (P2: preserve semantic context)", () => {
    const result = buildAccessibleExplanation([], true, "work");
    expect(result.summary).toContain("meaning-based match");
    expect(result.summary).toContain("Enhanced by AI");
    expect(result.primaryReason).toBe("meaning-based match");
    expect(result.usedSemantic).toBe(true);
  });

  it("handles undefined reasons", () => {
    const result = buildAccessibleExplanation(undefined, false, "review");
    expect(result.summary).toBe("Review. Found by search.");
  });

  it("truncates to 120 characters", () => {
    const result = buildAccessibleExplanation(["semantic"], true, "edition");
    expect(result.summary.length).toBeLessThanOrEqual(120);
  });

  it("labels unknown reasons as 'search match'", () => {
    const result = buildAccessibleExplanation(["unknown-internal-reason"], false, "work");
    expect(result.primaryReason).toBe("search match");
  });
});

describe("buildSearchStatusAnnouncement", () => {
  it("returns empty for idle", () => {
    expect(buildSearchStatusAnnouncement("idle")).toBe("");
  });

  it("announces searching state", () => {
    expect(buildSearchStatusAnnouncement("searching")).toBe("Searching…");
  });

  it("announces result count (singular)", () => {
    expect(buildSearchStatusAnnouncement("results", 1)).toBe("1 result found.");
  });

  it("announces result count (plural)", () => {
    expect(buildSearchStatusAnnouncement("results", 5)).toBe("5 results found.");
  });

  it("announces no results", () => {
    expect(buildSearchStatusAnnouncement("no-results")).toBe("No results found.");
  });

  it("announces error", () => {
    expect(buildSearchStatusAnnouncement("error")).toContain("error");
  });
});
