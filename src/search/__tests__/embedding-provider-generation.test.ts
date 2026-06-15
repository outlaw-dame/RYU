import { describe, it, expect, beforeEach } from "vitest";
import {
  getEmbeddingProvider,
  getEmbeddingProviderGeneration,
  registerEmbeddingProvider,
  resetEmbeddingProvider,
  type EmbeddingProvider
} from "../embedding-provider";

const minilmLikeProvider: EmbeddingProvider = {
  id: "minilm-test",
  dimensions: 384,
  embed: () => Array.from({ length: 384 }, () => 0)
};

const gemmaLikeProvider: EmbeddingProvider = {
  id: "gemma-test",
  dimensions: 768,
  embed: () => Array.from({ length: 768 }, () => 0)
};

describe("embedding provider generation tracking", () => {
  beforeEach(() => {
    resetEmbeddingProvider();
  });

  it("starts with a stable initial generation", () => {
    const before = getEmbeddingProviderGeneration();
    expect(typeof before).toBe("number");
  });

  it("advances generation when registering a new provider", () => {
    const before = getEmbeddingProviderGeneration();
    registerEmbeddingProvider(minilmLikeProvider);
    const after = getEmbeddingProviderGeneration();

    expect(after).toBeGreaterThan(before);
    expect(getEmbeddingProvider().id).toBe("minilm-test");
  });

  it("does not advance generation when re-registering the same provider", () => {
    registerEmbeddingProvider(minilmLikeProvider);
    const before = getEmbeddingProviderGeneration();
    registerEmbeddingProvider(minilmLikeProvider);
    const after = getEmbeddingProviderGeneration();

    expect(after).toBe(before);
  });

  it("advances generation on every distinct provider switch", () => {
    const g0 = getEmbeddingProviderGeneration();
    registerEmbeddingProvider(minilmLikeProvider);
    const g1 = getEmbeddingProviderGeneration();
    registerEmbeddingProvider(gemmaLikeProvider);
    const g2 = getEmbeddingProviderGeneration();

    expect(g1).toBeGreaterThan(g0);
    expect(g2).toBeGreaterThan(g1);
  });

  it("advances generation when resetting from a non-default provider", () => {
    registerEmbeddingProvider(minilmLikeProvider);
    const before = getEmbeddingProviderGeneration();
    resetEmbeddingProvider();
    const after = getEmbeddingProviderGeneration();

    expect(after).toBeGreaterThan(before);
    expect(getEmbeddingProvider().id).toBe("deterministic-v1");
  });

  it("does not advance generation when resetting an already-default provider", () => {
    resetEmbeddingProvider();
    const before = getEmbeddingProviderGeneration();
    resetEmbeddingProvider();
    const after = getEmbeddingProviderGeneration();

    expect(after).toBe(before);
  });
});
