import { describe, expect, it, vi } from "vitest";
import type { Recommendation } from "../discovery/types";
import { applyVerifiedReviewerTrustToDiscovery } from "./reviewer-trust-discovery";

const scope = {
  ownerAccountId: "owner-1",
  instanceOrigin: "https://books.example"
};

const edition = (id: string, score: number): Recommendation => ({
  id,
  entityType: "edition",
  title: id,
  reasons: [{ type: "popular_in_library", confidence: 0.5 }],
  source: "local_library",
  score,
  scoreTrace: Object.freeze({
    baseScore: score,
    finalScore: score,
    contributions: Object.freeze([]),
    hardSuppressions: Object.freeze([])
  }),
  generatedAt: "2026-07-25T00:00:00.000Z"
});

describe("verified reviewer trust discovery", () => {
  it("loads reviewer states once and applies bounded ranking changes", async () => {
    const loadStates = vi.fn(async () => new Map([
      ["reviewer-a", "trusted" as const],
      ["reviewer-b", "low_trust" as const]
    ]));

    const result = await applyVerifiedReviewerTrustToDiscovery(
      [edition("book-a", 0.5), edition("book-b", 0.6)],
      scope,
      {
        loadReviewerIds: vi.fn(async () => new Map([
          ["book-a", ["reviewer-a"]],
          ["book-b", ["reviewer-b"]]
        ])),
        loadStates
      }
    );

    expect(loadStates).toHaveBeenCalledTimes(1);
    expect(result.map((item) => item.id)).toEqual(["book-a", "book-b"]);
    expect(result[0].score).toBeCloseTo(0.7);
    expect(result[0].scoreTrace?.finalScore).toBe(result[0].score);
    expect(result[0].scoreTrace?.contributions).toContainEqual(expect.objectContaining({
      kind: "reviewer_trust",
      delta: 0.2
    }));
    expect(JSON.stringify(result)).not.toContain("reviewer-a");
  });

  it("hard-suppresses editions reviewed by a muted or blocked reviewer", async () => {
    const result = await applyVerifiedReviewerTrustToDiscovery(
      [edition("visible", 0.4), edition("hidden", 1)],
      scope,
      {
        loadReviewerIds: vi.fn(async () => new Map([
          ["visible", []],
          ["hidden", ["blocked-reviewer"]]
        ])),
        loadStates: vi.fn(async () => new Map([
          ["blocked-reviewer", "blocked" as const]
        ]))
      }
    );

    expect(result.map((item) => item.id)).toEqual(["visible"]);
  });

  it("leaves candidates unchanged when none have verified reviewer attribution", async () => {
    const recommendations = [edition("book-a", 0.5)];
    const loadStates = vi.fn();

    await expect(applyVerifiedReviewerTrustToDiscovery(recommendations, scope, {
      loadReviewerIds: vi.fn(async () => new Map())
    })).resolves.toEqual(recommendations);
    expect(loadStates).not.toHaveBeenCalled();
  });
});
