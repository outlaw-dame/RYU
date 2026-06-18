import { describe, it, expect, beforeEach } from "vitest";
import {
  parseVisibility,
  getCacheEligibility,
  visibilityToScope,
  visibilityToSearchTier,
  isRemoteStatusExpired,
  filterCacheableStatuses,
  filterSearchableStatuses,
  isVisibleOnActivitySurface,
  getVisibilityInfo
} from "./visibility-guard";
import { resetSearchBoundaryConfig, setSearchBoundaryConfig } from "../search/federated/searchBoundary";
import type { MastodonStatus } from "../sync/mastodon-client";

function makeStatus(visibility: string, createdAt?: string): MastodonStatus {
  return {
    id: "1",
    created_at: createdAt ?? new Date().toISOString(),
    account: { id: "acc1", acct: "user@remote.social" },
    content: "<p>Test post</p>",
    visibility
  } as MastodonStatus;
}

describe("visibility-guard", () => {
  beforeEach(() => {
    resetSearchBoundaryConfig();
  });

  describe("parseVisibility", () => {
    it("maps public to public", () => {
      expect(parseVisibility("public")).toBe("public");
    });

    it("maps unlisted to unlisted", () => {
      expect(parseVisibility("unlisted")).toBe("unlisted");
    });

    it("maps private to private", () => {
      expect(parseVisibility("private")).toBe("private");
    });

    it("maps followers to private", () => {
      expect(parseVisibility("followers")).toBe("private");
    });

    it("maps direct to direct", () => {
      expect(parseVisibility("direct")).toBe("direct");
    });

    it("maps undefined to private (safe default)", () => {
      expect(parseVisibility(undefined)).toBe("private");
    });

    it("maps unknown strings to private", () => {
      expect(parseVisibility("unknown_value")).toBe("private");
    });
  });

  describe("getCacheEligibility", () => {
    it("allows caching and search for public statuses", () => {
      const result = getCacheEligibility(makeStatus("public"));
      expect(result.cacheable).toBe(true);
      expect(result.searchable).toBe(true);
    });

    it("allows caching but not search for unlisted statuses", () => {
      const result = getCacheEligibility(makeStatus("unlisted"));
      expect(result.cacheable).toBe(true);
      expect(result.searchable).toBe(false);
    });

    it("blocks caching and search for private statuses", () => {
      const result = getCacheEligibility(makeStatus("private"));
      expect(result.cacheable).toBe(false);
      expect(result.searchable).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("blocks caching and search for direct messages", () => {
      const result = getCacheEligibility(makeStatus("direct"));
      expect(result.cacheable).toBe(false);
      expect(result.searchable).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  describe("visibilityToScope", () => {
    it("maps public to cache-only", () => {
      expect(visibilityToScope("public")).toBe("cache-only");
    });

    it("maps unlisted to cache-only", () => {
      expect(visibilityToScope("unlisted")).toBe("cache-only");
    });

    it("maps private to private", () => {
      expect(visibilityToScope("private")).toBe("private");
    });

    it("maps direct to private", () => {
      expect(visibilityToScope("direct")).toBe("private");
    });
  });

  describe("visibilityToSearchTier", () => {
    it("maps public to remote-cache tier", () => {
      expect(visibilityToSearchTier("public")).toBe("remote-cache");
    });

    it("maps unlisted to remote-cache tier", () => {
      expect(visibilityToSearchTier("unlisted")).toBe("remote-cache");
    });

    it("maps private to local-private tier", () => {
      expect(visibilityToSearchTier("private")).toBe("local-private");
    });

    it("maps direct to local-private tier", () => {
      expect(visibilityToSearchTier("direct")).toBe("local-private");
    });
  });

  describe("isRemoteStatusExpired", () => {
    it("returns false for fresh status", () => {
      const status = makeStatus("public", new Date().toISOString());
      expect(isRemoteStatusExpired(status)).toBe(false);
    });

    it("returns true for old status beyond TTL", () => {
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const status = makeStatus("public", oldDate);
      expect(isRemoteStatusExpired(status)).toBe(true);
    });

    it("respects custom TTL configuration", () => {
      setSearchBoundaryConfig({ remoteCacheTtlMs: 1000 });
      const recentDate = new Date(Date.now() - 2000).toISOString();
      const status = makeStatus("public", recentDate);
      expect(isRemoteStatusExpired(status)).toBe(true);
    });

    it("returns true for invalid date", () => {
      const status = makeStatus("public", "invalid-date");
      expect(isRemoteStatusExpired(status)).toBe(true);
    });
  });

  describe("filterCacheableStatuses", () => {
    it("keeps public and unlisted, removes private and direct", () => {
      const statuses = [
        makeStatus("public"),
        makeStatus("unlisted"),
        makeStatus("private"),
        makeStatus("direct")
      ].map((s, i) => ({ ...s, id: String(i) }));

      const result = filterCacheableStatuses(statuses as MastodonStatus[]);
      expect(result).toHaveLength(2);
    });

    it("removes expired statuses", () => {
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const statuses = [makeStatus("public", oldDate)];
      const result = filterCacheableStatuses(statuses);
      expect(result).toHaveLength(0);
    });
  });

  describe("filterSearchableStatuses", () => {
    it("only keeps public non-expired statuses", () => {
      const statuses = [
        makeStatus("public"),
        makeStatus("unlisted"),
        makeStatus("private")
      ].map((s, i) => ({ ...s, id: String(i) }));

      const result = filterSearchableStatuses(statuses as MastodonStatus[]);
      expect(result).toHaveLength(1);
      expect(result[0].visibility).toBe("public");
    });
  });

  describe("isVisibleOnActivitySurface", () => {
    it("returns true for all visibility levels in activity feed", () => {
      expect(isVisibleOnActivitySurface(makeStatus("public"))).toBe(true);
      expect(isVisibleOnActivitySurface(makeStatus("unlisted"))).toBe(true);
      expect(isVisibleOnActivitySurface(makeStatus("private"))).toBe(true);
      expect(isVisibleOnActivitySurface(makeStatus("direct"))).toBe(true);
    });
  });

  describe("getVisibilityInfo", () => {
    it("returns complete visibility info for public status", () => {
      const info = getVisibilityInfo(makeStatus("public"));
      expect(info.visibility).toBe("public");
      expect(info.canCache).toBe(true);
      expect(info.canSearch).toBe(true);
      expect(info.restrictionLabel).toBeUndefined();
    });

    it("returns restriction label for private status", () => {
      const info = getVisibilityInfo(makeStatus("private"));
      expect(info.visibility).toBe("private");
      expect(info.canCache).toBe(false);
      expect(info.canSearch).toBe(false);
      expect(info.restrictionLabel).toBeDefined();
    });
  });
});
