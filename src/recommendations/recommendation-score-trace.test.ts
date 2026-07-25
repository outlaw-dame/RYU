import { describe, expect, it } from "vitest";
import type { Recommendation } from "../discovery/types";
import {
  attachRecommendationScoreTrace,
  buildRecommendationScoreTrace
} from "./recommendation-score-trace";

const recommendation: Recommendation = {
  id: "edition-1",
  entityType: "edition",
  title: "Example",
  reasons: [
    {
      type: "because_you_read",
      sourceId: "edition-source",
      sourceLabel: "Earlier Book",
      confidence: 0.8
    }
  ],
  source: "local_library",
  score: 0.7,
  generatedAt: "2026-07-25T00:00:00.000Z"
};

describe("recommendation score trace", () => {
  it("uses the exact ranking adjustment and preserves source reasons", () => {
    const trace = buildRecommendationScoreTrace(recommendation, {
      stateByTarget: { "edition:edition-1": "show_more" }
    });

    expect(trace.baseScore).toBe(0.7);
    expect(trace.finalScore).toBeCloseTo(0.85);
    expect(trace.contributions).toEqual([
      expect.objectContaining({
        id: "reason:because_you_read:edition-source",
        kind: "reason",
        labelKey: "discovery.reason.becauseYouRead",
        labelParams: { title: "Earlier Book" },
        confidence: 0.8,
        delta: 0
      }),
      expect.objectContaining({
        id: "user_signal:show_more",
        kind: "user_signal",
        labelKey: "discovery.feedback.show_more",
        editableSignal: "show_more",
        delta: 0.15
      })
    ]);
  });

  it("keeps the ranked score and trace final score identical", () => {
    const ranked = attachRecommendationScoreTrace(recommendation, {
      stateByTarget: { "edition:edition-1": "show_less" }
    });

    expect(ranked.score).toBeCloseTo(0.55);
    expect(ranked.scoreTrace?.finalScore).toBe(ranked.score);
    expect(Object.isFrozen(ranked)).toBe(true);
    expect(Object.isFrozen(ranked.scoreTrace)).toBe(true);
    expect(Object.isFrozen(ranked.scoreTrace?.contributions)).toBe(true);
  });

  it("normalizes malformed numeric inputs instead of emitting NaN", () => {
    const trace = buildRecommendationScoreTrace(
      {
        ...recommendation,
        score: Number.NaN,
        reasons: [{ ...recommendation.reasons[0], confidence: Number.POSITIVE_INFINITY }]
      },
      { stateByTarget: {} }
    );

    expect(trace.baseScore).toBe(0);
    expect(trace.finalScore).toBe(0);
    expect(trace.contributions[0].confidence).toBe(0);
  });

  it("does not fabricate a ranking contribution for hard-hidden states", () => {
    const trace = buildRecommendationScoreTrace(recommendation, {
      stateByTarget: { "edition:edition-1": "suppress" }
    });

    expect(trace.finalScore).toBe(recommendation.score);
    expect(trace.contributions.every((item) => item.kind === "reason")).toBe(true);
    expect(trace.hardSuppressions).toEqual([]);
  });
});
