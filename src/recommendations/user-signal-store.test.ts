import { describe, expect, it } from "vitest";
import type { UserRecommendationSignalDoc } from "./user-signal-schema";
import {
  buildUserSignalSelector,
  listUserSignals,
  normalizeUserSignalScope,
  removeUserSignal,
  resetInferredUserSignals,
  type UserSignalPersistenceAdapter,
  upsertUserSignal
} from "./user-signal-store";

function createMemoryAdapter(seed: UserRecommendationSignalDoc[] = []) {
  const records = new Map(seed.map((signal) => [signal.id, signal]));
  const adapter: UserSignalPersistenceAdapter = {
    async upsert(signal) {
      records.set(signal.id, signal);
      return signal;
    },
    async list(selector) {
      return [...records.values()].filter((signal) =>
        Object.entries(selector).every(([key, value]) =>
          String(signal[key as keyof UserRecommendationSignalDoc]) === value
        )
      );
    },
    async get(id) {
      return records.get(id) ?? null;
    },
    async remove(id) {
      records.delete(id);
    }
  };
  return { adapter, records };
}

const scope = {
  ownerAccountId: "owner-1",
  instanceOrigin: "https://books.example"
};

async function insert(
  adapter: UserSignalPersistenceAdapter,
  overrides: Partial<Parameters<typeof upsertUserSignal>[0]> = {}
) {
  return upsertUserSignal({
    ...scope,
    entityType: "work",
    entityId: "work-1",
    signalType: "show_less",
    strength: -0.5,
    provenance: "user_explicit",
    ...overrides
  }, { adapter, now: new Date("2026-07-25T20:00:00.000Z") });
}

describe("user signal repository", () => {
  it("normalizes every selector to an account and instance scope", () => {
    expect(buildUserSignalSelector({
      ownerAccountId: " owner-1 ",
      instanceOrigin: "https://BOOKS.example",
      entityType: "work"
    })).toEqual({
      ownerAccountId: "owner-1",
      instanceOrigin: "https://books.example",
      entityType: "work"
    });
  });

  it("rejects malformed or insecure scopes", () => {
    expect(() => normalizeUserSignalScope({
      ownerAccountId: "",
      instanceOrigin: "https://books.example"
    })).toThrow(/scope/);
    expect(() => normalizeUserSignalScope({
      ownerAccountId: "owner-1",
      instanceOrigin: "http://books.example"
    })).toThrow(/scope/);
  });

  it("upserts deterministic records and lists only the requested scope", async () => {
    const { adapter } = createMemoryAdapter();
    const own = await insert(adapter);
    await insert(adapter, { ownerAccountId: "owner-2" });

    const result = await listUserSignals(scope, adapter);
    expect(result).toEqual([own]);
  });

  it("does not remove a foreign-scoped record or reveal whether it exists", async () => {
    const { adapter, records } = createMemoryAdapter();
    const foreign = await insert(adapter, { ownerAccountId: "owner-2" });

    await expect(removeUserSignal(foreign.id, scope, adapter)).resolves.toBe(false);
    expect(records.has(foreign.id)).toBe(true);
    await expect(removeUserSignal("missing", scope, adapter)).resolves.toBe(false);
  });

  it("removes only inferred signals for the active account scope", async () => {
    const { adapter, records } = createMemoryAdapter();
    const inferred = await insert(adapter, {
      entityId: "work-inferred",
      provenance: "local_inference"
    });
    const explicit = await insert(adapter, {
      entityId: "work-explicit",
      provenance: "user_explicit"
    });
    const foreign = await insert(adapter, {
      ownerAccountId: "owner-2",
      entityId: "work-foreign",
      provenance: "local_inference"
    });

    await expect(resetInferredUserSignals(scope, adapter)).resolves.toBe(1);
    expect(records.has(inferred.id)).toBe(false);
    expect(records.has(explicit.id)).toBe(true);
    expect(records.has(foreign.id)).toBe(true);
  });
});
