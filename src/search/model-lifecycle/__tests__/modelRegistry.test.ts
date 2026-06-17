import { describe, expect, it } from "vitest";
import {
  getEmbeddingArtifactRecord,
  getModelRegistryVersion,
  listEmbeddingArtifactRecords,
  modelCacheNamespace
} from "../modelRegistry";

describe("modelRegistry", () => {
  it("includes pinned entries for minilm and embeddinggemma", () => {
    const ids = listEmbeddingArtifactRecords().map((record) => record.id).sort();
    expect(ids).toEqual(["embeddinggemma", "minilm"]);
  });

  it("dimensions match what the providers expect", () => {
    expect(getEmbeddingArtifactRecord("minilm").dimensions).toBe(384);
    expect(getEmbeddingArtifactRecord("embeddinggemma").dimensions).toBe(768);
  });

  it("approximateSizeBytes are realistic positive integers", () => {
    for (const record of listEmbeddingArtifactRecords()) {
      expect(record.approximateSizeBytes).toBeGreaterThan(1024 * 1024);
      expect(Number.isInteger(record.approximateSizeBytes)).toBe(true);
    }
  });

  it("pinnedRevision is a non-empty string for every registered artifact", () => {
    for (const record of listEmbeddingArtifactRecords()) {
      expect(record.pinnedRevision).toBeTruthy();
      expect(typeof record.pinnedRevision).toBe("string");
    }
  });

  it("modelCacheNamespace embeds the registry version so bumps invalidate stale caches", () => {
    const namespace = modelCacheNamespace("minilm");
    expect(namespace).toContain(`v${getModelRegistryVersion()}`);
    expect(namespace).toContain("minilm");
  });
});
