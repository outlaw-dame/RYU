import { describe, expect, it, vi } from "vitest";

// Mock heavy dependencies so tests stay isolated.
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
    activeEmbeddingProvider: "deterministic",
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

    // Engine
    expect(snapshot.engine.providerId).toBe("deterministic-v1");
    expect(snapshot.engine.providerDimensions).toBe(128);
    expect(snapshot.engine.providerGeneration).toBe(3);
    expect(snapshot.engine.runtimeStatus.activeEmbeddingProvider).toBe("deterministic");

    // Index health
    expect(snapshot.index.health).not.toBeNull();
    expect(snapshot.index.health!.searchableDocuments).toBe(42);
    expect(snapshot.index.health!.missingVectors).toBe(2);
    expect(snapshot.index.health!.healthy).toBe(false);

    // Queue
    expect(snapshot.queue.writeThroughPending).toBe(5);
    expect(snapshot.queue.writeThroughActive).toBe(1);

    // Model
    expect(snapshot.model.models.length).toBe(1);
    expect(snapshot.model.models[0].id).toBe("minilm");
    expect(snapshot.model.models[0].state).toBe("ready");

    // Storage
    expect(snapshot.storage.storage.usageBytes).toBe(50_000_000);
    expect(snapshot.storage.storage.availableBytes).toBe(450_000_000);
    expect(snapshot.storage.storage.isPersistent).toBe(true);
  });

  it("never throws even when index health check fails", async () => {
    const { inspectSearchIndexHealth } = await import("../../index-lifecycle");
    vi.mocked(inspectSearchIndexHealth).mockRejectedValueOnce(new Error("DB is gone"));

    const snapshot = await captureSearchDiagnosticsSnapshot({} as any);

    expect(snapshot.index.health).toBeNull();
    expect(snapshot.index.healthError).toContain("DB is gone");
    // Other sections still captured.
    expect(snapshot.engine.providerId).toBe("deterministic-v1");
    expect(snapshot.storage.storage.reason).toBe("ok");
  });

  it("never includes private content — only counts, enums, and identifiers", async () => {
    const snapshot = await captureSearchDiagnosticsSnapshot({} as any);
    const serialized = JSON.stringify(snapshot);

    // Verify no query text, document bodies, or user content leaked.
    // The snapshot should only contain well-known identifiers and numbers.
    expect(serialized).not.toContain("private");
    expect(serialized).not.toContain("local-only");
    expect(serialized).not.toContain("My secret");
    // But well-known ids/enums are fine.
    expect(serialized).toContain("deterministic-v1");
    expect(serialized).toContain("minilm");
  });
});
