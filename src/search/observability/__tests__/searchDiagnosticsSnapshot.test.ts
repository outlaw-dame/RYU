import { describe, expect, it, vi } from "vitest";

vi.mock("../../embedding-provider", () => ({
  getEmbeddingProvider: vi.fn(() => ({
    id: "deterministic-v1",
    dimensions: 128,
    embed: async () => new Array(128).fill(0)
  })),
  getEmbeddingProviderGeneration: vi.fn(() => 3)
}));

vi.mock("../../runtime-status", () => ({
  getSearchRuntimeStatus: vi.fn(() => ({
    configuredEmbeddingRuntime: "auto",
    configuredRerankerRuntime: "off",
    activeEmbeddingProvider: "deterministic",
    activeRerankerProvider: "off",
    lastFallbackReason: undefined,
    lastError: undefined,
    deviceTier: "standard",
    lastAppliedAt: "2026-01-01T00:00:00.000Z"
  }))
}));

vi.mock("../../index-lifecycle", () => ({
  inspectSearchIndexHealth: vi.fn(async () => ({
    searchableDocuments: 42,
    vectorsForCurrentProvider: 40,
    vectorsForOtherProviders: 0,
    missingVectors: 2,
    staleVectors: 0,
    invalidVectors: 0,
    orphanVectors: 0,
    healthy: false,
    checkedAt: "2026-06-17T00:00:00.000Z"
  }))
}));

vi.mock("../../model-lifecycle", () => ({
  getAllModelStatuses: vi.fn(() => [
    { id: "minilm", state: "ready", progress: 1, bytesReceived: 22_000_000, lastChangedAt: "2026-06-17T00:00:00.000Z", readyRevision: "main" }
  ])
}));

vi.mock("../../model-lifecycle/storageQuota", () => ({
  probeStorageQuota: vi.fn(async () => ({
    usageBytes: 50_000_000,
    quotaBytes: 500_000_000,
    availableBytes: 450_000_000,
    isPersistent: true,
    reason: "ok"
  }))
}));

vi.mock("../../write-through-indexing", () => ({
  importedSearchIndexQueue: {
    pending: () => 5,
    active: () => 1
  }
}));

vi.mock("../../../db/client", () => ({
  initializeDatabase: vi.fn(async () => ({}))
}));

import { captureSearchDiagnosticsSnapshot } from "../searchDiagnosticsSnapshot";

describe("captureSearchDiagnosticsSnapshot", () => {
  it("captures engine, index, queue, model, and storage in one snapshot", async () => {
    const snapshot = await captureSearchDiagnosticsSnapshot({} as any);

    expect(snapshot.capturedAt).toBeTruthy();
    expect(snapshot.engine.providerId).toBe("deterministic-v1");
    expect(snapshot.engine.providerDimensions).toBe(128);
    expect(snapshot.engine.providerGeneration).toBe(3);
    expect(snapshot.engine.runtimeStatus.activeEmbeddingProvider).toBe("deterministic");
    expect(snapshot.index.health).not.toBeNull();
    expect(snapshot.index.health!.searchableDocuments).toBe(42);
    expect(snapshot.index.health!.missingVectors).toBe(2);
    expect(snapshot.index.health!.healthy).toBe(false);
    expect(snapshot.queue.writeThroughPending).toBe(5);
    expect(snapshot.queue.writeThroughActive).toBe(1);
    expect(snapshot.model.models.length).toBe(1);
    expect(snapshot.model.models[0].id).toBe("minilm");
    expect(snapshot.model.models[0].state).toBe("ready");
    expect(snapshot.storage.storage.usageBytes).toBe(50_000_000);
    expect(snapshot.storage.storage.availableBytes).toBe(450_000_000);
    expect(snapshot.storage.storage.isPersistent).toBe(true);
  });

  it("never throws or exports exception text when index health fails", async () => {
    const { inspectSearchIndexHealth } = await import("../../index-lifecycle");
    const secret = "owner-123 trusted reviewer alice@example.com query=dune";
    vi.mocked(inspectSearchIndexHealth).mockRejectedValueOnce(new Error(secret));

    const snapshot = await captureSearchDiagnosticsSnapshot({} as any);
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.index.health).toBeNull();
    expect(snapshot.index.healthError).toBe("index_health_check_failed");
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("alice@example.com");
    expect(snapshot.engine.providerId).toBe("deterministic-v1");
    expect(snapshot.storage.storage.reason).toBe("ok");
  });

  it("never includes private content — only counts, enums, and identifiers", async () => {
    const snapshot = await captureSearchDiagnosticsSnapshot({} as any);
    const serialized = JSON.stringify(snapshot);

    expect(serialized).not.toContain("private");
    expect(serialized).not.toContain("local-only");
    expect(serialized).not.toContain("My secret");
    expect(serialized).toContain("deterministic-v1");
    expect(serialized).toContain("minilm");
  });
});
