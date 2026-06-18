import { describe, it, expect } from "vitest";
import { classifyActivity, classifyActivities } from "./activity-classifier";
import type { MastodonStatus } from "../sync/mastodon-client";

function makeStatus(overrides: Partial<MastodonStatus> = {}): MastodonStatus {
  return {
    id: "1",
    created_at: "2024-01-01T12:00:00Z",
    account: { id: "acc1", acct: "reader@bookwyrm.social", display_name: "Reader" },
    content: "",
    visibility: "public",
    ...overrides
  } as MastodonStatus;
}

describe("activity-classifier", () => {
  describe("classifyActivity", () => {
    it("classifies a review with star rating and long content", () => {
      const status = makeStatus({
        content: '<p>Just finished reading "Project Hail Mary" by Andy Weir. ★★★★★ What an incredible book! The science is fascinating and the characters are so well written. Highly recommend to anyone who loves sci-fi.</p>'
      });
      const result = classifyActivity(status);
      expect(result.activityType).toBe("review");
      expect(result.isBookRelated).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it("classifies a rating with stars but short content", () => {
      const status = makeStatus({
        content: "<p>★★★★ Pretty good read.</p>"
      });
      const result = classifyActivity(status);
      expect(result.activityType).toBe("rating");
      expect(result.isBookRelated).toBe(true);
    });

    it("classifies a reading update from BookWyrm pattern", () => {
      const status = makeStatus({
        content: '<p>started reading "The Midnight Library" by Matt Haig</p>'
      });
      const result = classifyActivity(status);
      expect(result.activityType).toBe("reading-update");
      expect(result.isBookRelated).toBe(true);
    });

    it("classifies a post with #NowReading hashtag as reading update", () => {
      const status = makeStatus({
        content: '<p>Chapter 12 is wild <a class="mention hashtag" href="#">#NowReading</a></p>'
      });
      const result = classifyActivity(status);
      expect(result.activityType).toBe("reading-update");
      expect(result.isBookRelated).toBe(true);
    });

    it("classifies a recommendation post", () => {
      const status = makeStatus({
        content: '<p>If you love mysteries, check this out! <a class="mention hashtag" href="#">#BookRecommendation</a> <a class="mention hashtag" href="#">#Mystery</a></p>'
      });
      const result = classifyActivity(status);
      expect(result.activityType).toBe("recommendation");
      expect(result.isBookRelated).toBe(true);
    });

    it("classifies a book discussion with relevant hashtags", () => {
      const status = makeStatus({
        content: '<p>Love how this series handles world-building <a class="mention hashtag" href="#">#Fantasy</a> <a class="mention hashtag" href="#">#Bookstodon</a></p>'
      });
      const result = classifyActivity(status);
      expect(result.activityType).toBe("discussion");
      expect(result.isBookRelated).toBe(true);
    });

    it("classifies generic content as general", () => {
      const status = makeStatus({
        content: "<p>Had a great lunch today at the new cafe downtown! 🍕</p>"
      });
      const result = classifyActivity(status);
      expect(result.activityType).toBe("general");
      expect(result.isBookRelated).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it("extracts book references from quoted titles", () => {
      const status = makeStatus({
        content: '<p>Just finished reading "The Great Gatsby" and it was amazing! <a class="mention hashtag" href="#">#BookReview</a></p>'
      });
      const result = classifyActivity(status);
      expect(result.bookReferences).toContain("the great gatsby");
    });

    it("extracts relevant hashtags", () => {
      const status = makeStatus({
        content: '<p>Great read <a class="mention hashtag" href="#">#Bookstodon</a> <a class="mention hashtag" href="#">#SciFi</a> <a class="mention hashtag" href="#">#AmReading</a></p>'
      });
      const result = classifyActivity(status);
      expect(result.relevantHashtags).toContain("bookstodon");
      expect(result.relevantHashtags).toContain("scifi");
      expect(result.relevantHashtags).toContain("amreading");
    });

    it("handles empty content gracefully", () => {
      const status = makeStatus({ content: "" });
      const result = classifyActivity(status);
      expect(result.activityType).toBe("general");
      expect(result.isBookRelated).toBe(false);
    });

    it("handles undefined content gracefully", () => {
      const status = makeStatus({ content: undefined });
      const result = classifyActivity(status);
      expect(result.activityType).toBe("general");
      expect(result.isBookRelated).toBe(false);
    });

    it("detects book keywords in plain text", () => {
      const status = makeStatus({
        content: "<p>I just finished reading this incredible novel and I cannot put my thoughts into words. 5 stars easily.</p>"
      });
      const result = classifyActivity(status);
      expect(result.isBookRelated).toBe(true);
    });

    it("detects numeric rating patterns", () => {
      const status = makeStatus({
        content: "<p>Rating: 4/5 - solid writing throughout.</p>"
      });
      const result = classifyActivity(status);
      expect(result.activityType).toBe("rating");
      expect(result.isBookRelated).toBe(true);
    });
  });

  describe("classifyActivities", () => {
    it("classifies multiple statuses", () => {
      const statuses = [
        makeStatus({ id: "1", content: '<p>★★★★★ Amazing! <a class="mention hashtag" href="#">#BookReview</a></p>' }),
        makeStatus({ id: "2", content: "<p>Had pizza for dinner 🍕</p>" }),
        makeStatus({ id: "3", content: "<p>started reading a new book today</p>" })
      ];
      const results = classifyActivities(statuses);
      expect(results).toHaveLength(3);
      expect(results[0].isBookRelated).toBe(true);
      expect(results[1].isBookRelated).toBe(false);
      expect(results[2].isBookRelated).toBe(true);
    });
  });
});
