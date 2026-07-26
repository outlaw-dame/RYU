import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Recommendation } from "../discovery/types";
import { scoreAndFilterRecommendations, scoreRecommendation } from "./unified-scorer";

vi.mock("./signal-store", () => ({
  isEntitySuppressed: vi.fn(() => false),
  getEffectiveSignal: vi.fn(() => undefined)
}));
vi.mock("./reviewer-trust-store", () => ({
  computeReviewerTrustContribution: vi.fn(() => ({ delta: 0, exclude: false })),
  isReviewerExcluded: vi.fn(() => false)
}));

import { getEffectiveSignal, isEntitySuppressed } from "./signal-store";
import { computeReviewerTrustContribution, isReviewerExcluded } from "./reviewer-trust-store";

const ownerAccountId = "https://books.example#owner-1";
const mockGetEffectiveSignal = vi.mocked(getEffectiveSignal);
const mockIsEntitySuppressed = vi.mocked(isEntitySuppressed);
const mockTrustContribution = vi.mocked(computeReviewerTrustContribution);
const mockReviewerExcluded = vi.mocked(isReviewerExcluded);

function makeRec(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: "edition-1",
    entityType: "edition",
    title: "Test Book",
    authorIds: ["author-1"],
    reasons: [{ type: "because_you_read", confidence: 0.8 }],
    source: "local_library",
    score: 0.7,
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function signal(kind: "show_more" | "show_less" | "prefer", updatedAt = "2026-01-01T00:00:00.000Z") {
  return {
    id: `signal:${kind}`,
    entityType: "edition" as const,
    entityId: "edition-1",
    kind,
    strength: 1,
    provenance: "user_explicit" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt
  };
}

describe("unified scorer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEffectiveSignal.mockReturnValue(undefined);
    mockIsEntitySuppressed.mockReturnValue(false);
    mockTrustContribution.mockReturnValue({ delta: 0, exclude: false });
    mockReviewerExcluded.mockReturnValue(false);
  });

  it("passes through the base score without an authenticated owner", () => {
    const result = scoreRecommendation(makeRec({ score: 0.65 }));
    expect(result.scoreTrace.finalScore).toBe(0.65);
    expect(mockGetEffectiveSignal).not.toHaveBeenCalled();
  });

  it("passes owner scope to every signal lookup", () => {
    mockGetEffectiveSignal.mockImplementation((_type, _id, kind) =>
      kind === "show_more" ? signal("show_more") : undefined
    );
    const result = scoreRecommendation(makeRec({ score: 0.5 }), { ownerAccountId });
    expect(result.scoreTrace.finalScore).toBeCloseTo(0.7);
    expect(mockGetEffectiveSignal).toHaveBeenCalledWith(
      "edition", "edition-1", "show_more", ownerAccountId
    );
  });

  it("uses the newest opposing preference instead of applying both", () => {
    mockGetEffectiveSignal.mockImplementation((_type, _id, kind) => {
      if (kind === "show_more") return signal("show_more", "2026-01-01T00:00:00.000Z");
      if (kind === "show_less") return signal("show_less", "2026-01-02T00:00:00.000Z");
      return undefined;
    });
    const result = scoreRecommendation(makeRec({ score: 0.5 }), { ownerAccountId });
    expect(result.scoreTrace.finalScore).toBeCloseTo(0.35);
    expect(result.scoreTrace.contributions.filter((item) =>
      item.kind === "signal_boost" || item.kind === "signal_penalty"
    )).toHaveLength(1);
  });

  it("excludes a recommendation when its candidate author is suppressed", () => {
    mockIsEntitySuppressed.mockImplementation((type, id) =>
      type === "author" && id === "author-1"
    );
    const result = scoreRecommendation(makeRec(), { ownerAccountId });
    expect(result.scoreTrace.excluded).toBe(true);
    expect(result.scoreTrace.excludeReason).toContain("author");
    expect(mockIsEntitySuppressed).toHaveBeenCalledWith("author", "author-1", ownerAccountId);
  });

  it("passes owner scope to reviewer exclusion and trust scoring", () => {
    mockTrustContribution.mockReturnValue({ delta: 0.2, exclude: false });
    const result = scoreRecommendation(makeRec({ score: 0.5 }), {
      ownerAccountId,
      reviewerAccountId: "reviewer-1"
    });
    expect(result.scoreTrace.finalScore).toBeCloseTo(0.7);
    expect(mockReviewerExcluded).toHaveBeenCalledWith("reviewer-1", ownerAccountId);
    expect(mockTrustContribution).toHaveBeenCalledWith("reviewer-1", undefined, ownerAccountId);
  });

  it("filters excluded items and sorts remaining scores", () => {
    mockIsEntitySuppressed.mockImplementation((type, id) =>
      type === "edition" && id === "b"
    );
    const result = scoreAndFilterRecommendations([
      makeRec({ id: "a", authorIds: [], score: 0.3 }),
      makeRec({ id: "b", authorIds: [], score: 0.9 }),
      makeRec({ id: "c", authorIds: [], score: 0.6 })
    ], ownerAccountId);
    expect(result.map((item) => item.id)).toEqual(["c", "a"]);
  });

  it("clamps scores to the supported range", () => {
    mockGetEffectiveSignal.mockImplementation((_type, _id, kind) => {
      if (kind === "show_more") return signal("show_more");
      if (kind === "prefer") return signal("prefer");
      return undefined;
    });
    expect(scoreRecommendation(makeRec({ score: 0.9 }), { ownerAccountId })
      .scoreTrace.finalScore).toBe(1);
  });
});
