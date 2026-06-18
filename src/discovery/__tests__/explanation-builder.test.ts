import { describe, expect, it } from "vitest";
import {
  buildAllExplanations,
  buildPrimaryExplanation,
  buildReasonExplanation
} from "../explanation-builder";
import type { RecommendationReason } from "../types";

describe("explanation builder", () => {
  describe("buildReasonExplanation", () => {
    it("builds explanation for same_author", () => {
      const reason: RecommendationReason = {
        type: "same_author",
        sourceLabel: "J.R.R. Tolkien",
        confidence: 0.8
      };
      const explanation = buildReasonExplanation(reason);
      expect(explanation.key).toBe("discovery.reason.sameAuthor");
      expect(explanation.params).toEqual({ author: "J.R.R. Tolkien" });
    });

    it("builds explanation for same_work", () => {
      const reason: RecommendationReason = {
        type: "same_work",
        sourceLabel: "The Hobbit",
        confidence: 0.9
      };
      const explanation = buildReasonExplanation(reason);
      expect(explanation.key).toBe("discovery.reason.sameWork");
      expect(explanation.params).toEqual({ title: "The Hobbit" });
    });

    it("builds explanation for similar_title", () => {
      const reason: RecommendationReason = {
        type: "similar_title",
        sourceLabel: "The Lord of the Rings",
        confidence: 0.5
      };
      const explanation = buildReasonExplanation(reason);
      expect(explanation.key).toBe("discovery.reason.similarTitle");
      expect(explanation.params).toEqual({ title: "The Lord of the Rings" });
    });

    it("builds explanation for because_you_read", () => {
      const reason: RecommendationReason = {
        type: "because_you_read",
        sourceLabel: "Dune",
        confidence: 0.7
      };
      const explanation = buildReasonExplanation(reason);
      expect(explanation.key).toBe("discovery.reason.becauseYouRead");
      expect(explanation.params).toEqual({ title: "Dune" });
    });

    it("builds explanation for similar_author", () => {
      const reason: RecommendationReason = {
        type: "similar_author",
        sourceLabel: "Brandon Sanderson",
        confidence: 0.6
      };
      const explanation = buildReasonExplanation(reason);
      expect(explanation.key).toBe("discovery.reason.similarAuthor");
      expect(explanation.params).toEqual({ author: "Brandon Sanderson" });
    });

    it("builds explanation for popular_in_library", () => {
      const reason: RecommendationReason = {
        type: "popular_in_library",
        confidence: 0.5
      };
      const explanation = buildReasonExplanation(reason);
      expect(explanation.key).toBe("discovery.reason.popularInLibrary");
      expect(explanation.params).toBeUndefined();
    });

    it("omits params when sourceLabel is not provided", () => {
      const reason: RecommendationReason = {
        type: "same_author",
        confidence: 0.8
      };
      const explanation = buildReasonExplanation(reason);
      expect(explanation.key).toBe("discovery.reason.sameAuthor");
      expect(explanation.params).toBeUndefined();
    });
  });

  describe("buildPrimaryExplanation", () => {
    it("returns highest-confidence reason explanation", () => {
      const reasons: RecommendationReason[] = [
        { type: "similar_title", sourceLabel: "Book A", confidence: 0.3 },
        { type: "same_author", sourceLabel: "Author X", confidence: 0.8 },
        { type: "because_you_read", sourceLabel: "Book B", confidence: 0.6 }
      ];
      const explanation = buildPrimaryExplanation(reasons);
      expect(explanation.key).toBe("discovery.reason.sameAuthor");
      expect(explanation.params).toEqual({ author: "Author X" });
    });

    it("returns generic explanation for empty reasons", () => {
      const explanation = buildPrimaryExplanation([]);
      expect(explanation.key).toBe("discovery.reason.recommended");
    });
  });

  describe("buildAllExplanations", () => {
    it("returns all explanations sorted by confidence", () => {
      const reasons: RecommendationReason[] = [
        { type: "similar_title", sourceLabel: "Book A", confidence: 0.3 },
        { type: "same_author", sourceLabel: "Author X", confidence: 0.8 }
      ];
      const explanations = buildAllExplanations(reasons);
      expect(explanations).toHaveLength(2);
      expect(explanations[0].key).toBe("discovery.reason.sameAuthor");
      expect(explanations[1].key).toBe("discovery.reason.similarTitle");
    });

    it("returns generic explanation for empty reasons", () => {
      const explanations = buildAllExplanations([]);
      expect(explanations).toHaveLength(1);
      expect(explanations[0].key).toBe("discovery.reason.recommended");
    });
  });
});
