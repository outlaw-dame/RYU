import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasStorageHeadroomFor,
  isLowMemoryEnvironment,
  probeStorageQuota
} from "../storageQuota";
import { getEmbeddingArtifactRecord } from "../modelRegistry";

const originalNavigator = globalThis.navigator;
const originalPerformance = globalThis.performance;

afterEach(() => {
  if (originalNavigator) {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
      writable: true
    });
  }
  if (originalPerformance) {
    Object.defineProperty(globalThis, "performance", {
      value: originalPerformance,
      configurable: true,
      writable: true
    });
  }
});

function setNavigator(value: unknown): void {
  Object.defineProperty(globalThis, "navigator", {
    value,
    configurable: true,
    writable: true
  });
}

function setPerformance(value: unknown): void {
  Object.defineProperty(globalThis, "performance", {
    value,
    configurable: true,
    writable: true
  });
}

describe("probeStorageQuota", () => {
  it("returns a benign result when navigator.storage is missing (Safari path)", async () => {
    setNavigator({});
    const result = await probeStorageQuota();
    expect(result.reason).toContain("navigator.storage unavailable");
    expect(result.usageBytes).toBeUndefined();
    expect(result.quotaBytes).toBeUndefined();
  });

  it("returns a benign result when storage.estimate throws", async () => {
    setNavigator({
      storage: {
        persisted: vi.fn().mockResolvedValue(true),
        estimate: vi.fn().mockRejectedValue(new TypeError("denied"))
      }
    });
    const result = await probeStorageQuota();
    expect(result.reason).toContain("threw");
    expect(result.isPersistent).toBe(true);
  });

  it("computes availableBytes as quota - usage when both are reported", async () => {
    setNavigator({
      storage: {
        persisted: vi.fn().mockResolvedValue(false),
        estimate: vi.fn().mockResolvedValue({ usage: 100, quota: 1_000 })
      }
    });
    const result = await probeStorageQuota();
    expect(result.usageBytes).toBe(100);
    expect(result.quotaBytes).toBe(1_000);
    expect(result.availableBytes).toBe(900);
    expect(result.isPersistent).toBe(false);
  });

  it("never throws, even when navigator.storage.estimate returns garbage", async () => {
    setNavigator({
      storage: {
        estimate: vi.fn().mockResolvedValue({ usage: "not-a-number", quota: null })
      }
    });
    const result = await probeStorageQuota();
    expect(result.usageBytes).toBeUndefined();
    expect(result.quotaBytes).toBeUndefined();
    expect(result.availableBytes).toBeUndefined();
  });
});

describe("hasStorageHeadroomFor", () => {
  it("returns true when no quota information is available (conservative default)", () => {
    const artifact = getEmbeddingArtifactRecord("minilm");
    expect(hasStorageHeadroomFor({ reason: "ok" }, artifact)).toBe(true);
  });

  it("returns true when there is at least 2x the artifact size free", () => {
    const artifact = getEmbeddingArtifactRecord("minilm");
    const required = artifact.approximateSizeBytes * 2;
    expect(
      hasStorageHeadroomFor(
        { availableBytes: required, reason: "ok" },
        artifact
      )
    ).toBe(true);
  });

  it("returns false when free space is less than required headroom", () => {
    const artifact = getEmbeddingArtifactRecord("embeddinggemma");
    const tooLittle = artifact.approximateSizeBytes;
    expect(
      hasStorageHeadroomFor(
        { availableBytes: tooLittle, reason: "ok" },
        artifact
      )
    ).toBe(false);
  });

  it("respects a custom multiplier so callers can tune sensitivity", () => {
    const artifact = getEmbeddingArtifactRecord("minilm");
    expect(
      hasStorageHeadroomFor(
        { availableBytes: artifact.approximateSizeBytes, reason: "ok" },
        artifact,
        1
      )
    ).toBe(true);
  });
});

describe("isLowMemoryEnvironment", () => {
  it("returns false when performance.memory is unavailable (Safari)", () => {
    setPerformance({});
    expect(isLowMemoryEnvironment()).toBe(false);
  });

  it("returns true when JS heap headroom is below 512 MB", () => {
    setPerformance({
      memory: {
        jsHeapSizeLimit: 1_000_000_000,
        usedJSHeapSize: 800_000_000
      }
    });
    expect(isLowMemoryEnvironment()).toBe(true);
  });

  it("returns false when JS heap headroom exceeds 512 MB", () => {
    setPerformance({
      memory: {
        jsHeapSizeLimit: 4_000_000_000,
        usedJSHeapSize: 100_000_000
      }
    });
    expect(isLowMemoryEnvironment()).toBe(false);
  });
});
