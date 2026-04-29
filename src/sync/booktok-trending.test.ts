import { describe, expect, it } from "vitest";
import { CURATED_BOOKTOK_TRENDS, parseBookTokTrendingPayload } from "./booktok-trending";

describe("parseBookTokTrendingPayload", () => {
  it("parses a valid BookTok payload", () => {
    const trends = parseBookTokTrendingPayload({
      items: [
        {
          id: "trend-1",
          title: "Fourth Wing",
          author: "Rebecca Yarros",
          mentionCount: 120,
          sourceUrl: "https://example.com/booktok/trend-1"
        }
      ]
    });

    expect(trends).toHaveLength(1);
    expect(trends[0]).toMatchObject({
      id: "trend-1",
      title: "Fourth Wing",
      author: "Rebecca Yarros",
      mentionCount: 120
    });
  });

  it("rejects malformed payloads", () => {
    expect(() => parseBookTokTrendingPayload({ items: [{ id: "x" }] })).toThrow();
  });
});

describe("CURATED_BOOKTOK_TRENDS", () => {
  it("provides non-empty curated fallback entries", () => {
    expect(CURATED_BOOKTOK_TRENDS.length).toBeGreaterThan(0);
    for (const trend of CURATED_BOOKTOK_TRENDS) {
      expect(trend.id).toBeTruthy();
      expect(trend.title).toBeTruthy();
    }
  });
});