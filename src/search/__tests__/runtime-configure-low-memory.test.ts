import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the device-capabilities module so the test can drive the
// canAttempt* gates deterministically.
vi.mock("../device-capabilities", () => ({
  canAttemptEmbeddingGemma: vi.fn(() => true),
  canAttemptMiniLM: vi.fn(() => true),
  getDeviceCapabilityTier: vi.fn(() => "enhanced")
}));

// Mock the storage-quota module so we can drive low-memory + headroom.
vi.mock("../model-lifecycle/storageQuota", () => ({
  isLowMemoryEnvironment: vi.fn(() => false),
  hasStorageHeadroomFor: vi.fn(() => true),
  probeStorageQuota: vi.fn(async () => ({ reason: "ok" }))
}));

// Stub embedding-provider — we only verify status updates here.
vi.mock("../embedding-provider", () => ({
  registerEmbeddingProvider: vi.fn(),
  resetEmbeddingProvider: vi.fn()
}));

vi.mock("../reranker-provider", () => ({
  registerRerankerProvider: vi.fn(),
  clearRerankerProvider: vi.fn()
}));

// Loader stubs so loadEmbeddingProvider can resolve quickly.
vi.mock("../embeddinggemma-provider", () => ({
  createEmbeddingGemmaProvider: vi.fn(() => ({
    id: "embeddinggemma-300m-q8-with-deterministic-fallback",
    dimensions: 768,
    embed: async () => new Array(768).fill(0)
  }))
}));

vi.mock("../minilm-provider", () => ({
  createMiniLMEmbeddingProvider: vi.fn(() => ({
    id: "minilm-l6-v2-q8-with-deterministic-fallback",
    dimensions: 384,
    embed: async () => new Array(384).fill(0)
  }))
}));

import { applySearchRuntimeSettings } from "../runtime-configure";
import { getSearchRuntimeStatus } from "../runtime-status";
import { canAttemptEmbeddingGemma, canAttemptMiniLM } from "../device-capabilities";
import { isLowMemoryEnvironment } from "../model-lifecycle/storageQuota";

const mockCanAttemptEmbeddingGemma = vi.mocked(canAttemptEmbeddingGemma);
const mockCanAttemptMiniLM = vi.mocked(canAttemptMiniLM);
const mockIsLowMemory = vi.mocked(isLowMemoryEnvironment);

beforeEach(() => {
  mockCanAttemptEmbeddingGemma.mockReturnValue(true);
  mockCanAttemptMiniLM.mockReturnValue(true);
  mockIsLowMemory.mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("applySearchRuntimeSettings — low-memory adaptive fallback", () => {
  it("downgrades EmbeddingGemma to MiniLM (NOT all the way to deterministic) on low memory", async () => {
    mockIsLowMemory.mockReturnValue(true);
    mockCanAttemptMiniLM.mockReturnValue(true);

    applySearchRuntimeSettings({
      embeddingRuntime: "auto",
      rerankerRuntime: "off",
      webLLMIntentRefinement: false
    });

    // Allow microtasks to flush so the async load path completes.
    await Promise.resolve();
    await Promise.resolve();

    const status = getSearchRuntimeStatus();
    // Critical regression: a single apply must only fall back ONE level.
    // EmbeddingGemma -> MiniLM (not -> deterministic in the same pass).
    expect(status.lastFallbackReason).toContain("EmbeddingGemma");
    expect(status.lastFallbackReason).not.toContain("MiniLM");
  });

  it("downgrades MiniLM straight to deterministic on low memory", async () => {
    mockCanAttemptEmbeddingGemma.mockReturnValue(false);
    mockIsLowMemory.mockReturnValue(true);
    mockCanAttemptMiniLM.mockReturnValue(true);

    applySearchRuntimeSettings({
      embeddingRuntime: "minilm",
      rerankerRuntime: "off",
      webLLMIntentRefinement: false
    });

    await Promise.resolve();
    await Promise.resolve();

    const status = getSearchRuntimeStatus();
    expect(status.lastFallbackReason).toContain("MiniLM");
    // We routed through the deterministic branch, not the enhanced loader.
    expect(status.activeEmbeddingProvider).toBe("deterministic");
  });

  it("keeps EmbeddingGemma when memory is fine", async () => {
    mockIsLowMemory.mockReturnValue(false);

    applySearchRuntimeSettings({
      embeddingRuntime: "embeddinggemma",
      rerankerRuntime: "off",
      webLLMIntentRefinement: false
    });

    await Promise.resolve();
    await Promise.resolve();

    const status = getSearchRuntimeStatus();
    expect(status.lastFallbackReason ?? "").not.toContain("Low memory");
  });
});
