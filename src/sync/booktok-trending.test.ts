import { describe, expect, it } from "vitest";
import {
  CURATED_TRENDING_BOOKS,
  CURATED_BOOKTOK_TRENDS,
  parseTrendingBooksPayload,
  parseBookTokTrendingPayload
} from "./booktok-trending";

describe("parseTrendingBooksPayload", () => {
  it("parses a valid trending books payload", () => {
    const trends = parseTrendingBooksPayload({
      items: [
        {
          id: "trend-1",
          title: "Fourth Wing",
          author: "Rebecca Yarros",
          sourceUrl: "https://example.com/trending/trend-1"
        }
      ]
    });

    expect(trends).toHaveLength(1);
    expect(trends[0]).toMatchObject({
      id: "trend-1",
      title: "Fourth Wing",
      author: "Rebecca Yarros"
    });
  });

  it("rejects malformed payloads", () => {
    expect(() => parseTrendingBooksPayload({ items: [{ id: "x" }] })).toThrow();
  });

  it("trims whitespace from titles and IDs", () => {
    const trends = parseTrendingBooksPayload({
      items: [
        { id: "  trend-2  ", title: "  Iron Flame  ", author: " Rebecca Yarros " }
      ]
    });

    expect(trends[0].id).toBe("trend-2");
    expect(trends[0].title).toBe("Iron Flame");
    expect(trends[0].author).toBe("Rebecca Yarros");
  });
});

describe("parseBookTokTrendingPayload (backward compat alias)", () => {
  it("is the same function as parseTrendingBooksPayload", () => {
    expect(parseBookTokTrendingPayload).toBe(parseTrendingBooksPayload);
  });

  it("parses a valid payload via the alias", () => {
    const trends = parseBookTokTrendingPayload({
      items: [
        {
          id: "trend-1",
          title: "Fourth Wing",
          author: "Rebecca Yarros",
          sourceUrl: "https://example.com/trending/trend-1"
        }
      ]
    });

    expect(trends).toHaveLength(1);
    expect(trends[0].title).toBe("Fourth Wing");
  });
});

describe("CURATED_TRENDING_BOOKS", () => {
  it("provides non-empty curated fallback entries", () => {
    expect(CURATED_TRENDING_BOOKS.length).toBeGreaterThan(0);
    for (const trend of CURATED_TRENDING_BOOKS) {
      expect(trend.id).toBeTruthy();
      expect(trend.title).toBeTruthy();
    }
  });

  it("CURATED_BOOKTOK_TRENDS is the same reference (backward compat)", () => {
    expect(CURATED_BOOKTOK_TRENDS).toBe(CURATED_TRENDING_BOOKS);
  });
});
