/**
 * Tests for the unified scoring pipeline.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { scoreRecommendation, scoreAndFilterRecommendations } from "./unified-scorer";
import type { Recommendation } from "../discovery/types";

// Mock signal-store
vi.mock("./signal-store", () => ({
  isEntitySuppressed: vi.fn(() => false),
  getEffectiveSignal: vi.fn(() => undefined)
}));

// Mock reviewer-trust-store
vi.mock("./reviewer-trust-store", () => ({
  computeReviewerTrustContribution: vi.fn(() => ({ delta: 0, exclude: false })),
  isReviewerExcluded: vi.fn(() => false)
}));

import { isEntitySuppressed, getEffectiveSignal } from "./signal-store";
import { computeReviewerTrustContribution, isReviewerExcluded } from "./reviewer-trust-store";

const mockIsEntitySuppressed = vi.mocked(isEntitySuppressed);
const mockGetEffectiveSignal = vi.mocked(getEffectiveSignal);
const mockComputeReviewerTrustContribution = vi.mocked(computeReviewerTrustContribution);
const mockIsReviewerExcluded = vi.mocked(isReviewerExcluded);

function makeRec(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: "edition-1",
    entityType: "edition",
    title: "Test Book",
    reasons: [{ type: "because_you_read", confidence: 0.8, sourceLabel: "Another Book" }],
    source: "local_library",
    score: 0.7,
    generatedAt: new Date().toISOString(),
    ...overrides
  };
}

describe("unified-scorer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsEntitySuppressed.mockReturnValue(false);
    mockGetEffectiveSignal.mockReturnValue(undefined);
    mockComputeReviewerTrustContribution.mockReturnValue({ delta: 0, exclude: false });
    mockIsReviewerExcluded.mockReturnValue(false);
  });

  describe("scoreRecommendation", () => {
    it("passes through base score when no signals exist", () => {
      const rec = makeRec({ score: 0.65 });
      const result = scoreRecommendation(rec);

      expect(result.scoreTrace.baseScore).toBe(0.65);
      expect(result.scoreTrace.finalScore).toBe(0.65);
      expect(result.scoreTrace.excluded).toBe(false);
      expect(result.scoreTrace.contributions[0]).toEqual({
        kind: "base",
        delta: 0.65,
        label: "Base recommendation score"
      });
    });

    it("boosts score with show_more signal by bounded amount", () => {
      const rec = makeRec({ score: 0.5 });
      mockGetEffectiveSignal.mockImplementation((_et, _eid, kind) => {
        if (kind === "show_more") {
          return {
            id: "signal:edition:edition-1:show_more:user_explicit",
            entityType: "edition",
            entityId: "edition-1",
            kind: "show_more",
            strength: 0.8,
            provenance: "user_explicit",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        }
        return undefined;
      });

      const result = scoreRecommendation(rec);
      const expectedBoost = 0.8 * 0.2; // 0.16
      expect(result.scoreTrace.finalScore).toBeCloseTo(0.5 + expectedBoost, 5);

      const boostContrib = result.scoreTrace.contributions.find(c => c.kind === "signal_boost" && c.label === "Show more like this");
      expect(boostContrib).toBeDefined();
      expect(boostContrib!.delta).toBeCloseTo(expectedBoost, 5);
      expect(boostContrib!.signalId).toBe("signal:edition:edition-1:show_more:user_explicit");
    });

    it("reduces score with show_less signal by bounded amount", () => {
      const rec = makeRec({ score: 0.6 });
      mockGetEffectiveSignal.mockImplementation((_et, _eid, kind) => {
        if (kind === "show_less") {
          return {
            id: "signal:edition:edition-1:show_less:user_explicit",
            entityType: "edition",
            entityId: "edition-1",
            kind: "show_less",
            strength: 1.0,
            provenance: "user_explicit",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        }
        return undefined;
      });

      const result = scoreRecommendation(rec);
      const expectedPenalty = -(1.0 * 0.15); // -0.15
      expect(result.scoreTrace.finalScore).toBeCloseTo(0.6 + expectedPenalty, 5);

      const penaltyContrib = result.scoreTrace.contributions.find(c => c.kind === "signal_penalty");
      expect(penaltyContrib).toBeDefined();
      expect(penaltyContrib!.delta).toBeCloseTo(expectedPenalty, 5);
    });

    it("marks suppressed entities as excluded", () => {
      const rec = makeRec();
      mockIsEntitySuppressed.mockReturnValue(true);

      const result = scoreRecommendation(rec);
      expect(result.scoreTrace.excluded).toBe(true);
      expect(result.scoreTrace.excludeReason).toContain("Entity suppressed");
    });

    it("marks excluded reviewers as excluded", () => {
      const rec = makeRec();
      mockIsReviewerExcluded.mockReturnValue(true);

      const result = scoreRecommendation(rec, "reviewer-account-123");
      expect(result.scoreTrace.excluded).toBe(true);
      expect(result.scoreTrace.excludeReason).toContain("Reviewer excluded");
    });

    it("clamps finalScore to [0, 1] — lower bound", () => {
      const rec = makeRec({ score: 0.1 });
      // Apply multiple penalties that would push below 0
      mockGetEffectiveSignal.mockImplementation((_et, _eid, kind) => {
        if (kind === "show_less") {
          return {
            id: "sig-show-less",
            entityType: "edition",
            entityId: "edition-1",
            kind: "show_less",
            strength: 1.0,
            provenance: "user_explicit",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        }
        return undefined;
      });
      mockComputeReviewerTrustContribution.mockReturnValue({ delta: -0.15, exclude: false });

      const result = scoreRecommendation(rec, "some-reviewer");
      expect(result.scoreTrace.finalScore).toBe(0);
    });

    it("clamps finalScore to [0, 1] — upper bound", () => {
      const rec = makeRec({ score: 0.9 });
      mockGetEffectiveSignal.mockImplementation((_et, _eid, kind) => {
        if (kind === "show_more") {
          return {
            id: "sig-show-more",
            entityType: "edition",
            entityId: "edition-1",
            kind: "show_more",
            strength: 1.0,
            provenance: "user_explicit",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        }
        if (kind === "prefer") {
          return {
            id: "sig-prefer",
            entityType: "edition",
            entityId: "edition-1",
            kind: "prefer",
            strength: 1.0,
            provenance: "user_explicit",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        }
        return undefined;
      });

      const result = scoreRecommendation(rec);
      // 0.9 + 0.2 + 0.25 = 1.35 → clamped to 1
      expect(result.scoreTrace.finalScore).toBe(1);
    });

    it("produces accurate contributions trace", () => {
      const rec = makeRec({ score: 0.5 });
      mockGetEffectiveSignal.mockImplementation((_et, _eid, kind) => {
        if (kind === "show_more") {
          return {
            id: "sig-boost",
            entityType: "edition",
            entityId: "edition-1",
            kind: "show_more",
            strength: 0.6,
            provenance: "user_explicit",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        }
        return undefined;
      });
      mockComputeReviewerTrustContribution.mockReturnValue({ delta: 0.18, exclude: false });

      const result = scoreRecommendation(rec, "reviewer-1");
      const { contributions } = result.scoreTrace;

      expect(contributions).toHaveLength(3); // base + signal_boost + reviewer_trust
      expect(contributions[0]).toEqual({ kind: "base", delta: 0.5, label: "Base recommendation score" });
      expect(contributions[1]).toEqual({
        kind: "signal_boost",
        delta: 0.6 * 0.2,
        label: "Show more like this",
        signalId: "sig-boost"
      });
      expect(contributions[2]).toEqual({
        kind: "reviewer_trust",
        delta: 0.18,
        label: "Trusted reviewer boost"
      });

      expect(result.scoreTrace.finalScore).toBeCloseTo(0.5 + 0.12 + 0.18, 5);
    });
  });

  describe("scoreAndFilterRecommendations", () => {
    it("removes excluded items and sorts by finalScore descending", () => {
      const recs: Recommendation[] = [
        makeRec({ id: "a", score: 0.3 }),
        makeRec({ id: "b", score: 0.9 }),
        makeRec({ id: "c", score: 0.6 })
      ];

      // Suppress item "b"
      mockIsEntitySuppressed.mockImplementation((_et, eid) => eid === "b");

      const result = scoreAndFilterRecommendations(recs);

      // "b" should be excluded
      expect(result.map(r => r.id)).toEqual(["c", "a"]);
      expect(result[0].scoreTrace.finalScore).toBeGreaterThanOrEqual(result[1].scoreTrace.finalScore);
    });

    it("applies reviewer account IDs per recommendation", () => {
      const recs: Recommendation[] = [
        makeRec({ id: "x", score: 0.5 }),
        makeRec({ id: "y", score: 0.5 })
      ];

      // Exclude the reviewer for item "y"
      mockIsReviewerExcluded.mockImplementation((accountId) => accountId === "bad-reviewer");

      const reviewerMap = new Map<string, string>();
      reviewerMap.set("y", "bad-reviewer");
      reviewerMap.set("x", "good-reviewer");

      const result = scoreAndFilterRecommendations(recs, reviewerMap);

      expect(result.map(r => r.id)).toEqual(["x"]);
    });

    it("returns empty array when all items are excluded", () => {
      const recs: Recommendation[] = [
        makeRec({ id: "a", score: 0.5 }),
        makeRec({ id: "b", score: 0.8 })
      ];
      mockIsEntitySuppressed.mockReturnValue(true);

      const result = scoreAndFilterRecommendations(recs);
      expect(result).toEqual([]);
    });
  });
});
