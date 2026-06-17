import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the heavy dependencies before importing the module under test so
// the tests stay isolated from RxDB / IndexedDB initialization.
const resetEmbeddingProviderMock = vi.fn();
vi.mock("../../embedding-provider", () => ({
  resetEmbeddingProvider: () => resetEmbeddingProviderMock()
}));

const clearInMemoryMock = vi.fn();
const clearPersistedMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../../vector-index", () => ({
  clearInMemoryVectorIndex: () => clearInMemoryMock(),
  clearPersistedVectorsForCurrentProvider: () => clearPersistedMock()
}));

import {
  clearAllLocalAIArtifacts,
  registerExtractorResetHook,
  _getExtractorResetHookCount
} from "../clearArtifacts";
import { getModelStatus, markReady } from "../modelStatus";

const originalCaches = (globalThis as any).caches;
const originalIndexedDb = (globalThis as any).indexedDB;

afterEach(() => {
  if (originalCaches === undefined) {
    delete (globalThis as any).caches;
  } else {
    (globalThis as any).caches = originalCaches;
  }
  if (originalIndexedDb === undefined) {
    delete (globalThis as any).indexedDB;
  } else {
    (globalThis as any).indexedDB = originalIndexedDb;
  }
  vi.clearAllMocks();
});

beforeEach(() => {
  resetEmbeddingProviderMock.mockReset();
  clearInMemoryMock.mockReset();
  clearPersistedMock.mockReset().mockResolvedValue(undefined);
});

function installCachesMock(keys: string[]) {
  const deleted: string[] = [];
  (globalThis as any).caches = {
    keys: vi.fn().mockResolvedValue(keys),
    delete: vi.fn().mockImplementation(async (key: string) => {
      deleted.push(key);
      return true;
    })
  };
  return { deleted };
}

function installIndexedDbMock(behavior: "success" | "error" | "blocked") {
  (globalThis as any).indexedDB = {
    deleteDatabase: vi.fn().mockImplementation(() => {
      const request: any = {};
      queueMicrotask(() => {
        if (behavior === "success" && typeof request.onsuccess === "function") {
          request.onsuccess({});
        } else if (behavior === "error" && typeof request.onerror === "function") {
          request.onerror({});
        } else if (behavior === "blocked" && typeof request.onblocked === "function") {
          request.onblocked({});
        }
      });
      return request;
    })
  };
}

describe("clearAllLocalAIArtifacts", () => {
  it("orchestrates provider reset, vector clear, status reset, and reports them", async () => {
    delete (globalThis as any).caches;
    delete (globalThis as any).indexedDB;

    markReady("minilm", "main");
    expect(getModelStatus("minilm").state).toBe("ready");

    const report = await clearAllLocalAIArtifacts();

    expect(resetEmbeddingProviderMock).toHaveBeenCalledTimes(1);
    expect(clearPersistedMock).toHaveBeenCalledTimes(1);
    expect(clearInMemoryMock).toHaveBeenCalledTimes(1);
    expect(report.resetProvider).toBe(true);
    expect(report.clearedPersistedVectors).toBe(true);
    expect(report.clearedInMemory).toBe(true);
    expect(report.resetStatuses).toBe(true);
    expect(report.errors).toEqual([]);
    expect(getModelStatus("minilm").state).toBe("idle");
  });

  it("evicts CacheStorage entries that match model namespaces", async () => {
    const { deleted } = installCachesMock([
      "ryu:model:v1:minilm@main",
      "transformers-cache",
      "huggingface-1",
      "unrelated-app-cache"
    ]);
    delete (globalThis as any).indexedDB;

    const report = await clearAllLocalAIArtifacts();

    expect(deleted).toContain("ryu:model:v1:minilm@main");
    expect(deleted).toContain("transformers-cache");
    expect(deleted).toContain("huggingface-1");
    expect(deleted).not.toContain("unrelated-app-cache");
    expect(report.evictedCacheStorageEntries).toBe(3);
  });

  it("records IndexedDB databases it successfully deletes", async () => {
    delete (globalThis as any).caches;
    installIndexedDbMock("success");

    const report = await clearAllLocalAIArtifacts();

    expect(report.evictedIndexedDbDatabases.length).toBeGreaterThan(0);
    expect(report.evictedIndexedDbDatabases).toContain("transformers-cache");
  });

  it("never throws and reports errors when subsystems fail", async () => {
    delete (globalThis as any).caches;
    delete (globalThis as any).indexedDB;

    clearPersistedMock.mockReset().mockRejectedValueOnce(new Error("db gone"));

    const report = await clearAllLocalAIArtifacts();
    expect(report.errors).toContain("clearPersistedVectorsForCurrentProvider failed");
    // Subsequent steps still ran.
    expect(report.clearedInMemory).toBe(true);
    expect(report.resetStatuses).toBe(true);
  });

  it("invokes registered extractor reset hooks", async () => {
    delete (globalThis as any).caches;
    delete (globalThis as any).indexedDB;

    const hook = vi.fn();
    const unregister = registerExtractorResetHook(hook);

    const report = await clearAllLocalAIArtifacts();
    expect(hook).toHaveBeenCalledTimes(1);
    expect(report.resetExtractors).toBeGreaterThanOrEqual(1);

    unregister();
    expect(_getExtractorResetHookCount()).toBeGreaterThanOrEqual(0);
  });

  it("isolates a throwing extractor reset hook so other steps still run", async () => {
    delete (globalThis as any).caches;
    delete (globalThis as any).indexedDB;

    const unregister = registerExtractorResetHook(() => {
      throw new Error("hook crashed");
    });

    const report = await clearAllLocalAIArtifacts();
    expect(report.errors).toContain("extractor reset hook failed");
    expect(report.clearedInMemory).toBe(true);
    expect(report.resetStatuses).toBe(true);
    unregister();
  });
});
