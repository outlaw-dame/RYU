import { describe, expect, it, vi } from "vitest";
import {
  applyDiscoveryFeedbackScore,
  buildRecommendationTargetKey,
  buildUserSignalScopeFromSession,
  loadDiscoveryExclusionIds,
  loadDiscoveryFeedbackPolicy,
  recordDiscoveryNotInterested,
  resetHiddenDiscoveryFeedback
} from "./discovery-signal-runtime";
import type { UserRecommendationSignalDoc } from "./user-signal-schema";

const scope = {
  ownerAccountId: "42",
  instanceOrigin: "https://books.example"
};

function signal(
  id: string,
  signalType: UserRecommendationSignalDoc["signalType"],
  overrides: Partial<UserRecommendationSignalDoc> = {}
): UserRecommendationSignalDoc {
  return {
    id,
    ownerAccountId: scope.ownerAccountId,
    instanceOrigin: scope.instanceOrigin,
    entityType: "edition",
    entityId: "edition-1",
    signalType,
    strength: signalType === "show_more" ? 0.5 : -1,
    provenance: "user_explicit",
    createdAt: "2026-07-25T20:00:00.000Z",
    updatedAt: "2026-07-25T20:00:00.000Z",
    schemaVersion: 1,
    ...overrides
  };
}

describe("discovery signal runtime", () => {
  it("derives scope only from a connected session with immutable account id", () => {
    expect(buildUserSignalScopeFromSession({
      connected: true,
      instanceOrigin: "https://books.example/",
      account: { id: "42" }
    })).toEqual(scope);

    expect(buildUserSignalScopeFromSession({
      connected: true,
      instanceOrigin: "https://books.example",
      account: {}
    })).toBeNull();
  });

  it("loads not-interested and suppress records as durable exclusions", async () => {
    const policy = await loadDiscoveryFeedbackPolicy(scope, {
      migrateLegacy: vi.fn(async () => ({
        status: "complete" as const,
        migratedIds: [],
        unresolvedIds: [],
        invalidEntryCount: 0
      })),
      resolveEntityType: vi.fn(async () => null),
      listSignals: vi.fn(async () => [
        signal("hidden", "not_interested", { entityId: "edition-2" }),
        signal("suppressed", "suppress", { entityId: "edition-1" }),
        signal("foreign", "suppress", { ownerAccountId: "other", entityId: "edition-3" })
      ])
    });

    expect(policy.excludedIds).toEqual(["edition-1", "edition-2"]);
    expect(policy.stateByTarget[buildRecommendationTargetKey("edition", "edition-1")]).toBe("suppress");
    await expect(loadDiscoveryExclusionIds(scope, {
      migrateLegacy: vi.fn(async () => ({
        status: "complete" as const,
        migratedIds: [],
        unresolvedIds: [],
        invalidEntryCount: 0
      })),
      resolveEntityType: vi.fn(async () => null),
      listSignals: vi.fn(async () => [signal("suppressed", "suppress")])
    })).resolves.toEqual(["edition-1"]);
  });

  it("applies bounded positive and negative ranking adjustments", () => {
    expect(applyDiscoveryFeedbackScore(
      { id: "edition-1", entityType: "edition", score: 0.7 },
      { stateByTarget: { "edition:edition-1": "show_more" } }
    )).toBeCloseTo(0.85);
    expect(applyDiscoveryFeedbackScore(
      { id: "edition-1", entityType: "edition", score: 0.7 },
      { stateByTarget: { "edition:edition-1": "show_less" } }
    )).toBeCloseTo(0.55);
  });

  it("resets hidden durable targets before clearing matching legacy exclusions", async () => {
    const events: string[] = [];
    const resetFeedback = vi.fn(async (target: { id: string }) => {
      events.push(`durable:${target.id}`);
    });
    const removeLegacyExclusion = vi.fn((id: string) => {
      events.push(`legacy:${id}`);
    });

    await expect(resetHiddenDiscoveryFeedback(scope, {
      listSignals: vi.fn(async () => [
        signal("hidden", "not_interested"),
        signal("suppressed", "suppress", { entityType: "author", entityId: "author-1" }),
        signal("more", "show_more", { entityId: "edition-2" }),
        signal("foreign", "suppress", { ownerAccountId: "other", entityId: "edition-3" })
      ]),
      resetFeedback,
      removeLegacyExclusion
    })).resolves.toBe(2);

    expect(resetFeedback).toHaveBeenCalledTimes(2);
    expect(removeLegacyExclusion).toHaveBeenCalledTimes(2);
    expect(events.slice(0, 2).every((event) => event.startsWith("durable:"))).toBe(true);
    expect(events.slice(2).sort()).toEqual(["legacy:author-1", "legacy:edition-1"]);
  });

  it("keeps legacy exclusions when any durable reset fails", async () => {
    const removeLegacyExclusion = vi.fn();
    await expect(resetHiddenDiscoveryFeedback(scope, {
      listSignals: vi.fn(async () => [signal("hidden", "not_interested")]),
      resetFeedback: vi.fn(async () => { throw new Error("database unavailable"); }),
      removeLegacyExclusion
    })).rejects.toThrow("database unavailable");
    expect(removeLegacyExclusion).not.toHaveBeenCalled();
  });

  it("preserves legacy fallback before attempting durable persistence", async () => {
    const order: string[] = [];
    const writeSignal = vi.fn(async () => {
      order.push("durable");
      throw new Error("database unavailable");
    });

    await expect(recordDiscoveryNotInterested(
      { id: "edition-1", entityType: "edition" },
      scope,
      {
        writeLegacyExclusion: vi.fn(() => {
          order.push("legacy");
          return { enabled: true, excludedIds: ["edition-1"], federatedEnabled: false };
        }),
        writeSignal
      }
    )).rejects.toThrow("database unavailable");

    expect(order).toEqual(["legacy", "durable"]);
  });

  it("rejects insecure or incomplete session scope", () => {
    expect(() => buildUserSignalScopeFromSession({
      connected: true,
      instanceOrigin: "http://books.example",
      account: { id: "42" }
    })).toThrow();
  });
});
