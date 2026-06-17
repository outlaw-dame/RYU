import { afterEach, describe, expect, it } from "vitest";
import {
  getSearchBoundaryConfig,
  isRemoteCacheExpired,
  isTierVisibleOnSurface,
  resetSearchBoundaryConfig,
  scopeToSearchTier,
  setSearchBoundaryConfig,
  shouldIndexForSemanticSearch
} from "../searchBoundary";

afterEach(() => {
  resetSearchBoundaryConfig();
});

describe("scopeToSearchTier", () => {
  it("maps private/local-only to local-private", () => {
    expect(scopeToSearchTier("private")).toBe("local-private");
    expect(scopeToSearchTier("local-only")).toBe("local-private");
  });

  it("maps public/followers to local-public", () => {
    expect(scopeToSearchTier("public")).toBe("local-public");
    expect(scopeToSearchTier("followers")).toBe("local-public");
  });

  it("maps cache-only to remote-cache", () => {
    expect(scopeToSearchTier("cache-only")).toBe("remote-cache");
  });

  it("undefined scope defaults to local-public", () => {
    expect(scopeToSearchTier(undefined)).toBe("local-public");
  });
});

describe("shouldIndexForSemanticSearch", () => {
  it("indexes local-private and local-public", () => {
    expect(shouldIndexForSemanticSearch("private")).toBe(true);
    expect(shouldIndexForSemanticSearch("public")).toBe(true);
    expect(shouldIndexForSemanticSearch("followers")).toBe(true);
    expect(shouldIndexForSemanticSearch("local-only")).toBe(true);
  });

  it("indexes remote-cache when config allows it (default: true)", () => {
    expect(shouldIndexForSemanticSearch("cache-only")).toBe(true);
  });

  it("does NOT index remote-cache when disabled", () => {
    setSearchBoundaryConfig({ indexRemoteCacheVectors: false });
    expect(shouldIndexForSemanticSearch("cache-only")).toBe(false);
  });

  it("indexes undefined scope (defaults to local-public)", () => {
    expect(shouldIndexForSemanticSearch(undefined)).toBe(true);
  });
});

describe("isRemoteCacheExpired", () => {
  it("returns true for dates older than the TTL", () => {
    const config = getSearchBoundaryConfig();
    const old = new Date(Date.now() - config.remoteCacheTtlMs - 1).toISOString();
    expect(isRemoteCacheExpired(old)).toBe(true);
  });

  it("returns false for recent dates", () => {
    const recent = new Date(Date.now() - 1000).toISOString();
    expect(isRemoteCacheExpired(recent)).toBe(false);
  });

  it("returns true for invalid date strings", () => {
    expect(isRemoteCacheExpired("not-a-date")).toBe(true);
    expect(isRemoteCacheExpired("")).toBe(true);
  });

  it("respects custom TTL", () => {
    setSearchBoundaryConfig({ remoteCacheTtlMs: 1000 });
    const twoSecondsAgo = new Date(Date.now() - 2000).toISOString();
    expect(isRemoteCacheExpired(twoSecondsAgo)).toBe(true);
    const halfSecondAgo = new Date(Date.now() - 500).toISOString();
    expect(isRemoteCacheExpired(halfSecondAgo)).toBe(false);
  });
});

describe("isTierVisibleOnSurface", () => {
  it("local-private is only visible on library/shelf", () => {
    expect(isTierVisibleOnSurface("local-private", "library")).toBe(true);
    expect(isTierVisibleOnSurface("local-private", "shelf")).toBe(true);
    expect(isTierVisibleOnSurface("local-private", "global")).toBe(false);
    expect(isTierVisibleOnSurface("local-private", "entity")).toBe(false);
  });

  it("local-public is visible everywhere", () => {
    expect(isTierVisibleOnSurface("local-public", "global")).toBe(true);
    expect(isTierVisibleOnSurface("local-public", "library")).toBe(true);
    expect(isTierVisibleOnSurface("local-public", "entity")).toBe(true);
    expect(isTierVisibleOnSurface("local-public", "shelf")).toBe(true);
  });

  it("remote-cache is visible on global/entity/activity only", () => {
    expect(isTierVisibleOnSurface("remote-cache", "global")).toBe(true);
    expect(isTierVisibleOnSurface("remote-cache", "entity")).toBe(true);
    expect(isTierVisibleOnSurface("remote-cache", "activity")).toBe(true);
    expect(isTierVisibleOnSurface("remote-cache", "library")).toBe(false);
    expect(isTierVisibleOnSurface("remote-cache", "shelf")).toBe(false);
  });

  it("federated-discovery is only visible on global", () => {
    expect(isTierVisibleOnSurface("federated-discovery", "global")).toBe(true);
    expect(isTierVisibleOnSurface("federated-discovery", "library")).toBe(false);
    expect(isTierVisibleOnSurface("federated-discovery", "entity")).toBe(false);
  });
});

describe("boundary config", () => {
  it("has sensible defaults", () => {
    const config = getSearchBoundaryConfig();
    expect(config.remoteCacheTtlMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(config.allowFederatedPersistence).toBe(false);
    expect(config.indexRemoteCacheVectors).toBe(true);
    expect(config.maxRemoteCacheDocuments).toBe(10_000);
  });

  it("setSearchBoundaryConfig merges without overwriting", () => {
    setSearchBoundaryConfig({ remoteCacheTtlMs: 1000 });
    const config = getSearchBoundaryConfig();
    expect(config.remoteCacheTtlMs).toBe(1000);
    expect(config.indexRemoteCacheVectors).toBe(true);
  });

  it("resetSearchBoundaryConfig restores defaults", () => {
    setSearchBoundaryConfig({ remoteCacheTtlMs: 1, maxRemoteCacheDocuments: 1 });
    resetSearchBoundaryConfig();
    const config = getSearchBoundaryConfig();
    expect(config.remoteCacheTtlMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(config.maxRemoteCacheDocuments).toBe(10_000);
  });
});
