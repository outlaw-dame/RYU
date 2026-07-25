import { describe, expect, it, vi } from "vitest";
import {
  applyReviewerTrustRanking,
  loadReviewerTrustStateMap
} from "./reviewer-trust-ranking";
import type { UserRecommendationSignalDoc } from "./user-signal-schema";

const scope = {
  ownerAccountId: "owner-1",
  instanceOrigin: "https://books.example"
};

function signal(
  entityId: string,
  signalType: UserRecommendationSignalDoc["signalType"],
  updatedAt = "2026-07-25T20:00:00.000Z"
): UserRecommendationSignalDoc {
  return {
    id: `${entityId}:${signalType}`,
    ...scope,
    entityType: "account",
    entityId,
    signalType,
    strength: signalType === "trusted" ? 0.5 : -1,
    provenance: "user_explicit",
    createdAt: "2026-07-25T19:00:00.000Z",
    updatedAt,
    schemaVersion: 1
  };
}

describe("reviewer trust ranking", () => {
  it("loads requested reviewers in one scoped query and defaults missing reviewers to neutral", async () => {
    const listSignals = vi.fn(async () => [
      signal("reviewer-a", "trusted"),
      signal("unrequested", "reviewer_blocked")
    ]);

    const states = await loadReviewerTrustStateMap(
      scope,
      ["reviewer-a", "reviewer-b", "reviewer-a"],
      { listSignals }
    );

    expect(listSignals).toHaveBeenCalledTimes(1);
    expect(listSignals).toHaveBeenCalledWith({
      ...scope,
      entityType: "account",
      provenance: "user_explicit"
    });
    expect(states.get("reviewer-a")).toBe("trusted");
    expect(states.get("reviewer-b")).toBe("neutral");
    expect(states.has("unrequested")).toBe(false);
  });

  it("hard-suppresses candidates attributed to a muted or blocked reviewer", () => {
    const states = new Map([
      ["trusted", "trusted"],
      ["blocked", "blocked"]
    ] as const);

    const ranked = applyReviewerTrustRanking([
      { value: "safe", baseScore: 0.5, reviewerAccountIds: ["trusted"] },
      { value: "suppressed", baseScore: 1, reviewerAccountIds: ["trusted", "blocked"] }
    ], states);

    expect(ranked.map((item) => item.value)).toEqual(["safe"]);
    expect(ranked[0]?.score).toBeCloseTo(0.7);
  });

  it("does not stack multiple trusted reviewers beyond the positive cap", () => {
    const states = new Map([
      ["a", "trusted"],
      ["b", "trusted"]
    ] as const);

    const [ranked] = applyReviewerTrustRanking([
      { value: "book", baseScore: 0.6, reviewerAccountIds: ["a", "b"] }
    ], states);

    expect(ranked?.score).toBeCloseTo(0.8);
    expect(ranked?.reviewerTrust).toHaveLength(2);
  });

  it("allows opposing explicit states to cancel without exceeding the cap", () => {
    const states = new Map([
      ["trusted", "trusted"],
      ["low", "low_trust"]
    ] as const);

    const [ranked] = applyReviewerTrustRanking([
      { value: "book", baseScore: 0.6, reviewerAccountIds: ["trusted", "low"] }
    ], states);

    expect(ranked?.score).toBeCloseTo(0.6);
  });

  it("preserves stable source order when adjusted scores tie", () => {
    const ranked = applyReviewerTrustRanking([
      { value: "first", baseScore: 0.5, reviewerAccountIds: [] },
      { value: "second", baseScore: 0.5, reviewerAccountIds: [] }
    ], new Map());

    expect(ranked.map((item) => item.value)).toEqual(["first", "second"]);
  });

  it("can include suppressed candidates for audit and explanation surfaces", () => {
    const [ranked] = applyReviewerTrustRanking([
      { value: "book", baseScore: 0.9, reviewerAccountIds: ["muted"] }
    ], new Map([["muted", "muted"]]), { includeSuppressed: true });

    expect(ranked?.hardSuppressed).toBe(true);
    expect(ranked?.reviewerTrust[0]).toEqual({
      reviewerAccountId: "muted",
      state: "muted",
      scoreAdjustment: 0,
      hardSuppressed: true
    });
  });

  it("rejects non-finite scores and oversized reviewer sets", () => {
    expect(() => applyReviewerTrustRanking([
      { value: "bad", baseScore: Number.NaN, reviewerAccountIds: [] }
    ], new Map())).toThrow("baseScore must be finite");

    expect(() => applyReviewerTrustRanking([
      {
        value: "bad",
        baseScore: 0,
        reviewerAccountIds: Array.from({ length: 65 }, (_, index) => `reviewer-${index}`)
      }
    ], new Map())).toThrow("Too many reviewer account IDs");
  });
});
