import { describe, expect, it } from "vitest";
import type { Recommendation } from "../discovery/types";
import { evaluateRecommendationPolicy } from "./recommendation-score-trace";

const edition: Recommendation = {
  id: "shared-id",
  entityType: "edition",
  title: "Example Edition",
  reasons: [{ type: "popular_in_library", confidence: 0.6 }],
  source: "local_library",
  score: 0.7,
  generatedAt: "2026-07-25T00:00:00.000Z"
};

const author: Recommendation = {
  ...edition,
  entityType: "author",
  title: "Example Author"
};

describe("recommendation policy evaluation", () => {
  it("hard-suppresses only the exact typed target", () => {
    const policy = {
      stateByTarget: { "edition:shared-id": "suppress" as const }
    };

    const editionResult = evaluateRecommendationPolicy(edition, policy);
    const authorResult = evaluateRecommendationPolicy(author, policy);

    expect(editionResult.included).toBe(false);
    if (!editionResult.included) {
      expect(editionResult.scoreTrace.hardSuppressions).toEqual(["user_signal:suppress"]);
      expect(editionResult.scoreTrace.finalScore).toBe(edition.score);
      expect(Object.isFrozen(editionResult.scoreTrace.hardSuppressions)).toBe(true);
    }

    expect(authorResult.included).toBe(true);
    if (authorResult.included) {
      expect(authorResult.recommendation.scoreTrace?.hardSuppressions).toEqual([]);
    }
  });

  it("records not-interested as a hard suppression without inventing a score delta", () => {
    const result = evaluateRecommendationPolicy(edition, {
      stateByTarget: { "edition:shared-id": "not_interested" }
    });

    expect(result.included).toBe(false);
    if (!result.included) {
      expect(result.scoreTrace.baseScore).toBe(0.7);
      expect(result.scoreTrace.finalScore).toBe(0.7);
      expect(result.scoreTrace.contributions.every((item) => item.kind === "reason")).toBe(true);
      expect(result.scoreTrace.hardSuppressions).toEqual(["user_signal:not_interested"]);
    }
  });

  it("returns an immutable visible recommendation with the exact adjusted score", () => {
    const result = evaluateRecommendationPolicy(edition, {
      stateByTarget: { "edition:shared-id": "show_less" }
    });

    expect(result.included).toBe(true);
    if (result.included) {
      expect(result.recommendation.score).toBeCloseTo(0.55);
      expect(result.recommendation.scoreTrace?.finalScore).toBe(result.recommendation.score);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.recommendation)).toBe(true);
      expect(Object.isFrozen(result.recommendation.scoreTrace)).toBe(true);
    }
  });
});
