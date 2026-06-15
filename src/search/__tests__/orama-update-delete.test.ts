import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks must be set up before importing the module under test.
const insertMock = vi.fn();
const updateMock = vi.fn();
const removeMock = vi.fn();
const searchMock = vi.fn();
const createMock = vi.fn();

vi.mock("@orama/orama", () => ({
  create: (...args: unknown[]) => createMock(...args),
  insert: (...args: unknown[]) => insertMock(...args),
  update: (...args: unknown[]) => updateMock(...args),
  remove: (...args: unknown[]) => removeMock(...args),
  search: (...args: unknown[]) => searchMock(...args)
}));

const indexDocumentMock = vi.fn();
const removeFromInMemoryMock = vi.fn();
vi.mock("../vector-index", () => ({
  indexDocument: (...args: unknown[]) => indexDocumentMock(...args),
  removeFromInMemoryVectorIndex: (...args: unknown[]) => removeFromInMemoryMock(...args)
}));

vi.mock("../search-document-projection", () => ({
  authorDocToSearchDocument: (doc: any) => ({
    id: doc.id,
    type: "author",
    title: doc.name,
    description: "",
    authorText: doc.name,
    isbnText: "",
    enrichmentText: "",
    source: "local",
    updatedAt: doc.updatedAt
  })
}));

vi.mock("../ranking", () => ({
  rankLexical: (docs: unknown[]) => docs,
  dedupe: (docs: unknown[]) => docs
}));

vi.mock("../../db/client", () => {
  return {
    initializeDatabase: vi.fn(),
    DEFAULT_RYU_DATABASE_NAME: "ryu"
  };
});

import { removeFromOramaIndex, removeAllFromOramaIndexById, getOramaState } from "../orama";

function makeMockDb() {
  const subscribers: Record<string, ((change: any) => void)[]> = {
    authors: [],
    editions: [],
    works: []
  };
  const collection = (kind: string, items: any[]) => ({
    find: () => ({ exec: async () => items }),
    findOne: (id: string) => ({ exec: async () => items.find((i) => i.id === id) ?? null }),
    $: {
      subscribe: (handler: (change: any) => void) => {
        subscribers[kind].push(handler);
        return { unsubscribe: () => undefined };
      }
    }
  });

  const db = {
    name: "test-db",
    authors: collection("authors", [{ id: "a1", name: "Octavia Butler", updatedAt: "2026-01-01T00:00:00Z" }]),
    editions: collection("editions", []),
    works: collection("works", []),
    searchvectors: collection("searchvectors", []),
    emit(kind: string, change: any) {
      for (const h of subscribers[kind]) h(change);
    }
  };
  return db as any;
}

describe("orama update/delete lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue({ id: "orama-instance" });
    insertMock.mockImplementation(async () => `orama-id-${insertMock.mock.calls.length}`);
    updateMock.mockImplementation(async (_idx, _id) => `orama-id-updated-${updateMock.mock.calls.length}`);
    removeMock.mockResolvedValue(true);
    indexDocumentMock.mockResolvedValue(undefined);
  });

  it("removes a document from the lexical index by type + id", async () => {
    const db = makeMockDb();
    const state = await getOramaState(db);

    // Manually insert so the oramaIds map is populated
    insertMock.mockResolvedValueOnce("orama-test-id-1");
    const doc = {
      id: "x1", type: "edition" as const, title: "Test", description: "",
      authorText: "", isbnText: "", enrichmentText: "", source: "local" as const, updatedAt: ""
    };
    state.oramaIds.set("edition:x1", "orama-test-id-1");

    await removeFromOramaIndex("edition", "x1", db);

    expect(removeMock).toHaveBeenCalledWith(state.index, "orama-test-id-1");
    expect(state.oramaIds.has("edition:x1")).toBe(false);
    // Vector store eviction must also fire
    expect(removeFromInMemoryMock).toHaveBeenCalledWith("x1");
  });

  it("is a no-op when removing an unindexed document", async () => {
    const db = makeMockDb();
    await getOramaState(db);

    await removeFromOramaIndex("edition", "never-indexed", db);

    expect(removeMock).not.toHaveBeenCalled();
  });

  it("removeAllFromOramaIndexById attempts every entity type", async () => {
    const db = makeMockDb();
    const state = await getOramaState(db);
    state.oramaIds.set("author:shared", "orama-a");
    state.oramaIds.set("edition:shared", "orama-e");
    state.oramaIds.set("work:shared", "orama-w");

    await removeAllFromOramaIndexById("shared", db);

    expect(removeMock).toHaveBeenCalledTimes(3);
    expect(state.oramaIds.has("author:shared")).toBe(false);
    expect(state.oramaIds.has("edition:shared")).toBe(false);
    expect(state.oramaIds.has("work:shared")).toBe(false);
  });

  it("subscribes to UPDATE events and calls Orama update()", async () => {
    const db = makeMockDb();
    const state = await getOramaState(db);

    // Pre-populate so update can find an existing oramaId
    state.oramaIds.set("work:w1", "orama-w-1");

    db.emit("works", {
      operation: "UPDATE",
      documentData: {
        id: "w1",
        title: "Updated",
        summary: "",
        authorIds: [],
        updatedAt: "2026-02-01T00:00:00Z"
      }
    });

    // Wait for the async subscription handler
    await new Promise((r) => setTimeout(r, 0));

    expect(updateMock).toHaveBeenCalled();
  });

  it("subscribes to DELETE events using documentId or previousDocumentData", async () => {
    const db = makeMockDb();
    const state = await getOramaState(db);

    state.oramaIds.set("edition:e1", "orama-e-1");

    // Real RxDB DELETE events expose the id via documentId / previousDocumentData
    db.emit("editions", {
      operation: "DELETE",
      documentId: "e1",
      previousDocumentData: { id: "e1" }
    });

    await new Promise((r) => setTimeout(r, 0));

    expect(removeMock).toHaveBeenCalled();
    expect(state.oramaIds.has("edition:e1")).toBe(false);
    expect(removeFromInMemoryMock).toHaveBeenCalledWith("e1");
  });

  it("queues concurrent updates for the same key sequentially", async () => {
    const db = makeMockDb();
    const state = await getOramaState(db);

    let inflight = 0;
    let peakInflight = 0;
    insertMock.mockImplementation(async () => {
      inflight++;
      if (inflight > peakInflight) peakInflight = inflight;
      await new Promise((r) => setTimeout(r, 5));
      inflight--;
      return `orama-id-${insertMock.mock.calls.length}`;
    });
    updateMock.mockImplementation(async () => {
      inflight++;
      if (inflight > peakInflight) peakInflight = inflight;
      await new Promise((r) => setTimeout(r, 5));
      inflight--;
      return `orama-id-${updateMock.mock.calls.length}`;
    });

    // Fire three rapid UPDATE events for the same id
    state.oramaIds.set("work:w1", "orama-w-1");
    db.emit("works", {
      operation: "UPDATE",
      documentData: { id: "w1", title: "T1", summary: "", authorIds: [], updatedAt: "2026-01-01T00:00:00Z" }
    });
    db.emit("works", {
      operation: "UPDATE",
      documentData: { id: "w1", title: "T2", summary: "", authorIds: [], updatedAt: "2026-01-02T00:00:00Z" }
    });
    db.emit("works", {
      operation: "UPDATE",
      documentData: { id: "w1", title: "T3", summary: "", authorIds: [], updatedAt: "2026-01-03T00:00:00Z" }
    });

    // Wait for the chain to drain
    await new Promise((r) => setTimeout(r, 50));

    // All three updates should have been processed (none dropped) but never
    // overlapping in flight for the same key.
    expect(updateMock).toHaveBeenCalledTimes(3);
    expect(peakInflight).toBeLessThanOrEqual(1);
  });
});
