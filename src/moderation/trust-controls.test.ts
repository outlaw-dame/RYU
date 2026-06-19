import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addSuppression,
  removeSuppression,
  isSuppressed,
  loadSuppressions,
  saveSuppressions,
  computeTrustScore,
  detectReviewBomb,
  computeSpamScore,
  getPresetConfig,
  loadCommunitySettings,
  saveCommunitySettings,
  getEffectiveSpamThreshold,
  isReviewBombDetectionEnabled,
  isSemanticFilteringEnabled
} from "./trust-controls";
import type { ReviewEntry, ReviewBombInput } from "./trust-controls";

describe("trust-controls", () => {
  const mockStorage = new Map<string, string>();

  beforeEach(() => {
    mockStorage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mockStorage.get(key) ?? null,
      setItem: (key: string, value: string) => { mockStorage.set(key, value); },
      removeItem: (key: string) => { mockStorage.delete(key); },
      get length() { return mockStorage.size; },
      key: (index: number) => [...mockStorage.keys()][index] ?? null,
      clear: () => { mockStorage.clear(); }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("suppression store", () => {
    it("starts with empty suppressions", () => {
      expect(loadSuppressions()).toEqual([]);
    });

    it("adds a suppression entry", () => {
      const result = addSuppression("author", "J.K. Rowling", "personal preference");
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("author");
      expect(result[0].target).toBe("J.K. Rowling");
      expect(result[0].reason).toBe("personal preference");
    });

    it("does not duplicate suppressions", () => {
      addSuppression("author", "Test Author");
      const result = addSuppression("author", "test author");
      expect(result).toHaveLength(1);
    });

    it("allows same target with different types", () => {
      addSuppression("author", "Test");
      const result = addSuppression("work", "Test");
      expect(result).toHaveLength(2);
    });

    it("removes a suppression by ID", () => {
      const entries = addSuppression("author", "Author 1");
      addSuppression("work", "Work 1");
      const result = removeSuppression(entries[0].id);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("work");
    });

    it("checks if target is suppressed", () => {
      addSuppression("author", "Suppressed Author");
      expect(isSuppressed("author", "Suppressed Author")).toBe(true);
      expect(isSuppressed("author", "suppressed author")).toBe(true);
      expect(isSuppressed("author", "Other Author")).toBe(false);
      expect(isSuppressed("work", "Suppressed Author")).toBe(false);
    });
  });

  describe("computeTrustScore", () => {
    it("returns low trust for brand new accounts", () => {
      const score = computeTrustScore({ accountAgeDays: 1 });
      expect(score.overall).toBeLessThan(0.3);
      expect(score.accountAge).toBeLessThan(0.1);
      expect(score.spamScore).toBeGreaterThan(0.7);
    });

    it("returns high trust for established accounts", () => {
      const score = computeTrustScore({
        accountAgeDays: 365,
        postCount: 500,
        followerCount: 200,
        followingCount: 150,
        isVerified: true
      });
      expect(score.overall).toBeGreaterThan(0.7);
      expect(score.spamScore).toBeLessThan(0.3);
    });

    it("penalizes accounts with previous violations", () => {
      const clean = computeTrustScore({ accountAgeDays: 90, postCount: 50, followerCount: 30, followingCount: 30 });
      const violated = computeTrustScore({ accountAgeDays: 90, postCount: 50, followerCount: 30, followingCount: 30, previousViolations: 3 });
      expect(violated.communityStanding).toBeLessThan(clean.communityStanding);
    });

    it("scores are bounded between 0 and 1", () => {
      const score = computeTrustScore({ accountAgeDays: 1000, postCount: 10000, followerCount: 50000 });
      expect(score.overall).toBeLessThanOrEqual(1);
      expect(score.overall).toBeGreaterThanOrEqual(0);
      expect(score.spamScore).toBeLessThanOrEqual(1);
      expect(score.spamScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe("detectReviewBomb", () => {
    const now = Date.now();
    const hourAgo = new Date(now - 3600000).toISOString();
    const newAccountDate = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days old
    const oldAccountDate = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year old

    function makeReviews(count: number, options: { rating?: number; newAccount?: boolean } = {}): ReviewEntry[] {
      const { rating = 1, newAccount = true } = options;
      return Array.from({ length: count }, (_, i) => ({
        accountId: `account-${i}`,
        rating,
        accountCreatedAt: newAccount ? newAccountDate : oldAccountDate,
        createdAt: hourAgo,
        content: "bad book"
      }));
    }

    it("does not detect when too few reviews", () => {
      const result = detectReviewBomb({
        workId: "book-1",
        reviews: makeReviews(3)
      });
      expect(result.detected).toBe(false);
      expect(result.reason).toContain("Insufficient reviews");
    });

    it("detects review-bomb with many low ratings from new accounts", () => {
      const reviews = makeReviews(10, { rating: 1, newAccount: true });
      const result = detectReviewBomb({
        workId: "book-1",
        reviews,
        minReviewCount: 5
      });
      expect(result.detected).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.suspiciousCount).toBeGreaterThan(0);
    });

    it("does not detect when ratings are from established accounts", () => {
      const reviews = makeReviews(10, { rating: 1, newAccount: false });
      const result = detectReviewBomb({
        workId: "book-1",
        reviews,
        minReviewCount: 5
      });
      // Low ratings from established accounts: less suspicious
      expect(result.confidence).toBeLessThan(0.75);
    });

    it("does not detect when ratings are mixed (not all low)", () => {
      const lowReviews = makeReviews(3, { rating: 1, newAccount: true });
      const highReviews = makeReviews(7, { rating: 5, newAccount: false });
      const result = detectReviewBomb({
        workId: "book-1",
        reviews: [...lowReviews, ...highReviews],
        minReviewCount: 5
      });
      expect(result.detected).toBe(false);
    });

    it("respects custom window and thresholds", () => {
      // Reviews from 2 days ago should be outside a 1-hour window
      const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
      const reviews: ReviewEntry[] = Array.from({ length: 10 }, (_, i) => ({
        accountId: `account-${i}`,
        rating: 1,
        accountCreatedAt: newAccountDate,
        createdAt: twoDaysAgo
      }));

      const result = detectReviewBomb({
        workId: "book-1",
        reviews,
        windowMs: 3600000 // 1 hour
      });
      expect(result.detected).toBe(false);
      expect(result.totalInWindow).toBe(0);
    });
  });

  describe("computeSpamScore", () => {
    it("returns low spam score for normal content", () => {
      const result = computeSpamScore({
        content: "I really enjoyed this book. The characters were well-developed and the plot was engaging throughout.",
        accountAgeDays: 365
      });
      expect(result.score).toBeLessThan(0.4);
      expect(result.flagged).toBe(false);
    });

    it("returns high spam score for link-heavy content from new account", () => {
      const result = computeSpamScore({
        content: "Check out https://spam.com and https://spam2.com and https://spam3.com",
        accountAgeDays: 2
      });
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.signals.linkDensity).toBeGreaterThan(0);
      expect(result.signals.newAccountPenalty).toBeGreaterThan(0.5);
    });

    it("returns high spam score for repetitive content", () => {
      const result = computeSpamScore({
        content: "buy buy buy buy buy buy buy buy buy buy buy buy now now now now now",
        accountAgeDays: 5
      });
      expect(result.signals.repetitiveContent).toBeGreaterThan(0);
    });

    it("gives no new-account penalty to established accounts", () => {
      const result = computeSpamScore({
        content: "Check https://example.com",
        accountAgeDays: 365,
        isEstablished: true
      });
      expect(result.signals.newAccountPenalty).toBe(0);
    });

    it("flags short content with links", () => {
      const result = computeSpamScore({
        content: "Click https://x.co",
        accountAgeDays: 1
      });
      expect(result.signals.shortContent).toBeGreaterThan(0);
    });

    it("uses provided linkCount when available", () => {
      const result = computeSpamScore({
        content: "some text",
        accountAgeDays: 30,
        linkCount: 5,
        contentLength: 50
      });
      expect(result.signals.linkDensity).toBeGreaterThan(0);
    });
  });

  describe("community moderation presets", () => {
    it("returns correct strict config", () => {
      const config = getPresetConfig("strict");
      expect(config.preset).toBe("strict");
      expect(config.overrides.spamThreshold).toBe(0.4);
      expect(config.overrides.reviewBombDetection).toBe(true);
      expect(config.overrides.semanticFiltering).toBe(true);
    });

    it("returns correct moderate config", () => {
      const config = getPresetConfig("moderate");
      expect(config.preset).toBe("moderate");
      expect(config.overrides.spamThreshold).toBe(0.6);
    });

    it("returns correct permissive config", () => {
      const config = getPresetConfig("permissive");
      expect(config.preset).toBe("permissive");
      expect(config.overrides.spamThreshold).toBe(0.8);
      expect(config.overrides.reviewBombDetection).toBe(false);
      expect(config.overrides.semanticFiltering).toBe(false);
    });

    it("saves and loads community settings", () => {
      const settings = getPresetConfig("strict");
      saveCommunitySettings(settings);
      const loaded = loadCommunitySettings();
      expect(loaded.preset).toBe("strict");
      expect(loaded.overrides.spamThreshold).toBe(0.4);
    });

    it("defaults to moderate when no settings saved", () => {
      const loaded = loadCommunitySettings();
      expect(loaded.preset).toBe("moderate");
    });

    it("handles invalid stored JSON", () => {
      mockStorage.set("ryu:community-moderation", "bad json");
      const loaded = loadCommunitySettings();
      expect(loaded.preset).toBe("moderate");
    });

    it("getEffectiveSpamThreshold uses settings", () => {
      const settings = getPresetConfig("strict");
      expect(getEffectiveSpamThreshold(settings)).toBe(0.4);
    });

    it("isReviewBombDetectionEnabled respects preset", () => {
      expect(isReviewBombDetectionEnabled(getPresetConfig("strict"))).toBe(true);
      expect(isReviewBombDetectionEnabled(getPresetConfig("permissive"))).toBe(false);
    });

    it("isSemanticFilteringEnabled respects preset", () => {
      expect(isSemanticFilteringEnabled(getPresetConfig("moderate"))).toBe(true);
      expect(isSemanticFilteringEnabled(getPresetConfig("permissive"))).toBe(false);
    });
  });
});
