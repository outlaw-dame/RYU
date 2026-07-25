import { describe, expect, it, vi } from "vitest";
import {
  getRecommendationFeedbackState,
  listRecommendationFeedbackOptions,
  setRecommendationFeedbackState
} from "./recommendation-feedback";
import type { UserRecommendationSignalDoc } from "./user-signal-schema";
import type { UserSignalScope } from "./user-signal-store";

const scope: UserSignalScope = {
  ownerAccountId: "owner-1",
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

describe("recommendation feedback controls", () => {
  it("defaults to neutral and queries only the authenticated scope", async () => {
    const listSignals = vi.fn().mockResolvedValue([]);

    await expect(getRecommendationFeedbackState(
      { id: " edition-1 ", entityType: "edition" },
      scope,
      { listSignals }
    )).resolves.toBe("neutral");

    expect(listSignals).toHaveBeenCalledWith({
      ...scope,
      entityType: "edition",
      entityId: "edition-1",
      provenance: "user_explicit"
    });
  });

  it("uses conservative precedence when conflicting records coexist", async () => {
    const listSignals = vi.fn().mockResolvedValue([
      signal("more", "show_more"),
      signal("less", "show_less"),
      signal("blocked", "suppress")
    ]);

    await expect(getRecommendationFeedbackState(
      { id: "edition-1", entityType: "edition" },
      scope,
      { listSignals }
    )).resolves.toBe("suppress");
  });

  it("ignores expired records", async () => {
    const listSignals = vi.fn().mockResolvedValue([
      signal("expired", "suppress", { expiresAt: "2020-01-01T00:00:00.000Z" }),
      signal("more", "show_more")
    ]);

    await expect(getRecommendationFeedbackState(
      { id: "edition-1", entityType: "edition" },
      scope,
      { listSignals }
    )).resolves.toBe("show_more");
  });

  it("persists the requested state before removing conflicts", async () => {
    const events: string[] = [];
    const existing = signal("old-suppress", "suppress");
    const persisted = signal("new-more", "show_more", { strength: 0.5 });

    const result = await setRecommendationFeedbackState(
      { id: "edition-1", entityType: "edition" },
      scope,
      "show_more",
      {
        listSignals: vi.fn().mockResolvedValue([existing]),
        writeSignal: vi.fn(async (input) => {
          events.push(`write:${input.signalType}`);
          return persisted;
        }),
        removeSignal: vi.fn(async (id) => {
          events.push(`remove:${id}`);
          return true;
        })
      }
    );

    expect(events).toEqual(["write:show_more", "remove:old-suppress"]);
    expect(result).toMatchObject({
      state: "show_more",
      persistedSignal: persisted,
      removedSignalCount: 1
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("reset removes only explicit feedback records for the target", async () => {
    const removeSignal = vi.fn().mockResolvedValue(true);
    const inferred = signal("inferred", "show_less", { provenance: "local_inference" });
    const unrelated = signal("trusted", "trusted");
    const explicit = signal("explicit", "not_interested");

    const result = await setRecommendationFeedbackState(
      { id: "edition-1", entityType: "edition" },
      scope,
      "neutral",
      {
        listSignals: vi.fn().mockResolvedValue([inferred, unrelated, explicit]),
        removeSignal
      }
    );

    expect(removeSignal).toHaveBeenCalledTimes(1);
    expect(removeSignal).toHaveBeenCalledWith("explicit", scope);
    expect(result).toEqual({ state: "neutral", persistedSignal: null, removedSignalCount: 1 });
  });

  it("rejects invalid targets before persistence", async () => {
    const listSignals = vi.fn();

    await expect(setRecommendationFeedbackState(
      { id: " ", entityType: "edition" },
      scope,
      "show_more",
      { listSignals }
    )).rejects.toThrow("required");
    expect(listSignals).not.toHaveBeenCalled();
  });

  it("provides complete UI-ready metadata", () => {
    const options = listRecommendationFeedbackOptions();

    expect(options.map((option) => option.state)).toEqual([
      "show_more",
      "show_less",
      "not_interested",
      "suppress",
      "neutral"
    ]);
    expect(options.filter((option) => option.destructive).map((option) => option.state))
      .toEqual(["not_interested", "suppress"]);
    expect(options.every((option) => Object.isFrozen(option))).toBe(true);
    expect(options.every((option) => option.description.length > 30)).toBe(true);
  });
});
