import { describe, expect, it, vi } from "vitest";
import type { UserRecommendationSignalDoc } from "./user-signal-schema";
import {
  getReviewerTrustState,
  reviewerTrustEffect,
  selectReviewerTrustState,
  setReviewerTrustState
} from "./reviewer-trust";

const scope = {
  ownerAccountId: "owner-1",
  instanceOrigin: "https://books.example"
};

function signal(
  signalType: UserRecommendationSignalDoc["signalType"],
  updatedAt = "2026-07-25T20:00:00.000Z",
  expiresAt?: string
): UserRecommendationSignalDoc {
  return {
    id: `signal-${signalType}`,
    ...scope,
    entityType: "account",
    entityId: "reviewer-1",
    signalType,
    strength: signalType === "trusted" ? 0.5 : -1,
    provenance: "user_explicit",
    ...(expiresAt ? { expiresAt } : {}),
    createdAt: "2026-07-25T19:00:00.000Z",
    updatedAt,
    schemaVersion: 1
  };
}

describe("reviewer trust", () => {
  it("defaults to neutral and never promotes trust automatically", async () => {
    const listSignals = vi.fn(async () => [] as UserRecommendationSignalDoc[]);
    await expect(getReviewerTrustState(scope, "reviewer-1", { listSignals })).resolves.toBe("neutral");
    expect(listSignals).toHaveBeenCalledWith(expect.objectContaining({
      ownerAccountId: "owner-1",
      instanceOrigin: "https://books.example",
      entityType: "account",
      entityId: "reviewer-1",
      provenance: "user_explicit"
    }));
  });

  it("gives blocked and muted conservative precedence over score states", () => {
    expect(selectReviewerTrustState([
      signal("trusted", "2026-07-25T20:05:00.000Z"),
      signal("reviewer_blocked", "2026-07-25T20:00:00.000Z")
    ])).toBe("blocked");

    expect(selectReviewerTrustState([
      signal("low_trust", "2026-07-25T20:05:00.000Z"),
      signal("reviewer_muted", "2026-07-25T20:00:00.000Z")
    ])).toBe("muted");
  });

  it("ignores expired reviewer states", () => {
    expect(selectReviewerTrustState([
      signal("reviewer_blocked", "2026-07-25T20:00:00.000Z", "2026-07-25T20:30:00.000Z")
    ], Date.parse("2026-07-25T21:00:00.000Z"))).toBe("neutral");
  });

  it("persists the new state before removing conflicting states", async () => {
    const order: string[] = [];
    const existing = [signal("reviewer_blocked")];
    const writeSignal = vi.fn(async () => {
      order.push("write");
      return signal("trusted");
    });
    const removeSignal = vi.fn(async () => {
      order.push("remove");
      return true;
    });

    await expect(setReviewerTrustState(scope, "reviewer-1", "trusted", {
      listSignals: vi.fn(async () => existing),
      writeSignal,
      removeSignal
    })).resolves.toBe("trusted");

    expect(order).toEqual(["write", "remove"]);
    expect(writeSignal).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "account",
      entityId: "reviewer-1",
      signalType: "trusted",
      strength: 0.5,
      provenance: "user_explicit"
    }));
  });

  it("neutral removes reviewer states without touching unrelated account signals", async () => {
    const reviewerState = signal("low_trust");
    const unrelated = signal("show_less");
    const removeSignal = vi.fn(async () => true);

    await expect(setReviewerTrustState(scope, "reviewer-1", "neutral", {
      listSignals: vi.fn(async () => [reviewerState, unrelated]),
      writeSignal: vi.fn(),
      removeSignal
    })).resolves.toBe("neutral");

    expect(removeSignal).toHaveBeenCalledTimes(1);
    expect(removeSignal).toHaveBeenCalledWith(reviewerState.id, scope);
  });

  it("caps reviewer ranking influence and hard-suppresses muted or blocked reviewers", () => {
    expect(reviewerTrustEffect("trusted")).toEqual({
      state: "trusted",
      scoreAdjustment: 0.2,
      hardSuppressed: false
    });
    expect(reviewerTrustEffect("low_trust").scoreAdjustment).toBe(-0.2);
    expect(reviewerTrustEffect("muted").hardSuppressed).toBe(true);
    expect(reviewerTrustEffect("blocked").hardSuppressed).toBe(true);
  });

  it("rejects missing reviewer identities before persistence", async () => {
    await expect(setReviewerTrustState(scope, "   ", "trusted", {
      listSignals: vi.fn()
    })).rejects.toThrow("Reviewer account ID is required");
  });
});
