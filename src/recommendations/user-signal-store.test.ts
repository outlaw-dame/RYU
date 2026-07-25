import { describe, expect, it, vi } from "vitest";
import type { RyuDatabase } from "../db/client";
import type { UserRecommendationSignalDoc } from "./user-signal-schema";
import {
  buildUserSignalSelector,
  listUserSignals,
  normalizeUserSignalScope,
  removeUserSignal,
  resetInferredUserSignals,
  upsertUserSignal,
  UserSignalStoreError
} from "./user-signal-store";

const NOW = new Date("2026-07-25T20:00:00.000Z");

function makeStoredSignal(overrides: Partial<UserRecommendationSignalDoc> = {}): UserRecommendationSignalDoc {
  return {
    id: "signal-1",
    ownerAccountId: "owner-1",
    instanceOrigin: "https://books.example",
    entityType: "work",
    entityId: "work-1",
    signalType: "show_less",
    strength: -0.7,
    provenance: "user_explicit",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    schemaVersion: 1,
    ...overrides
  };
}

function makeDocument(signal: UserRecommendationSignalDoc) {
  return {
    ...signal,
    toJSON: () => ({ ...signal }),
    incrementalRemove: vi.fn(async () => undefined)
  };
}

function makeDatabase(options: {
  signals?: UserRecommendationSignalDoc[];
  findOne?: UserRecommendationSignalDoc | null;
} = {}) {
  const documents = (options.signals ?? []).map(makeDocument);
  const singleDocument = options.findOne ? makeDocument(options.findOne) : null;
  const collection = {
    incrementalUpsert: vi.fn(async (signal: UserRecommendationSignalDoc) => makeDocument(signal)),
    find: vi.fn(() => ({ exec: vi.fn(async () => documents) })),
    findOne: vi.fn(() => ({ exec: vi.fn(async () => singleDocument) }))
  };

  return {
    database: { userrecommendationsignals: collection } as unknown as RyuDatabase,
    collection,
    documents,
    singleDocument
  };
}

describe("user signal persistence store", () => {
  it("always scopes list selectors by owner and normalized instance origin", () => {
    expect(buildUserSignalSelector({
      ownerAccountId: " owner-1 ",
      instanceOrigin: "HTTPS://BOOKS.EXAMPLE",
      entityType: "author",
      entityId: " author-1 ",
      provenance: "user_explicit"
    })).toEqual({
      ownerAccountId: "owner-1",
      instanceOrigin: "https://books.example",
      entityType: "author",
      entityId: "author-1",
      provenance: "user_explicit"
    });
  });

  it("rejects unsafe or empty account scopes before database access", () => {
    expect(() => normalizeUserSignalScope({
      ownerAccountId: "",
      instanceOrigin: "https://books.example"
    })).toThrow(UserSignalStoreError);

    expect(() => buildUserSignalSelector({
      ownerAccountId: "owner-1",
      instanceOrigin: "https://user:pass@books.example"
    })).toThrow(UserSignalStoreError);
  });

  it("validates and atomically upserts a canonical signal", async () => {
    const { database, collection } = makeDatabase();
    const stored = await upsertUserSignal({
      ownerAccountId: "owner-1",
      instanceOrigin: "https://books.example",
      entityType: "work",
      entityId: "work-1",
      signalType: "show_less",
      strength: -0.5,
      provenance: "user_explicit"
    }, NOW, database);

    expect(collection.incrementalUpsert).toHaveBeenCalledOnce();
    expect(stored.ownerAccountId).toBe("owner-1");
    expect(stored.id).toContain("owner-1");
  });

  it("lists only through the scoped selector", async () => {
    const signal = makeStoredSignal();
    const { database, collection } = makeDatabase({ signals: [signal] });
    const result = await listUserSignals({
      ownerAccountId: "owner-1",
      instanceOrigin: "https://books.example",
      entityType: "work"
    }, database);

    expect(collection.find).toHaveBeenCalledWith({
      selector: {
        ownerAccountId: "owner-1",
        instanceOrigin: "https://books.example",
        entityType: "work"
      }
    });
    expect(result).toEqual([signal]);
  });

  it("does not reveal or remove a foreign-scoped document", async () => {
    const foreign = makeStoredSignal({ ownerAccountId: "owner-2" });
    const { database, singleDocument } = makeDatabase({ findOne: foreign });

    await expect(removeUserSignal("signal-1", {
      ownerAccountId: "owner-1",
      instanceOrigin: "https://books.example"
    }, database)).resolves.toBe(false);
    expect(singleDocument?.incrementalRemove).not.toHaveBeenCalled();
  });

  it("removes a document only when both owner and instance match", async () => {
    const signal = makeStoredSignal();
    const { database, singleDocument } = makeDatabase({ findOne: signal });

    await expect(removeUserSignal("signal-1", {
      ownerAccountId: "owner-1",
      instanceOrigin: "https://books.example"
    }, database)).resolves.toBe(true);
    expect(singleDocument?.incrementalRemove).toHaveBeenCalledOnce();
  });

  it("resets only local inference within one account scope", async () => {
    const inferred = makeStoredSignal({ provenance: "local_inference" });
    const { database, collection, documents } = makeDatabase({ signals: [inferred] });
    await expect(resetInferredUserSignals({
      ownerAccountId: "owner-1",
      instanceOrigin: "https://books.example"
    }, database)).resolves.toBe(1);

    expect(collection.find).toHaveBeenCalledWith({
      selector: {
        ownerAccountId: "owner-1",
        instanceOrigin: "https://books.example",
        provenance: "local_inference"
      }
    });
    expect(documents[0].incrementalRemove).toHaveBeenCalledOnce();
  });
});
