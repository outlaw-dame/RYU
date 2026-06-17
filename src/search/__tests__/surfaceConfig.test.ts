import { describe, it, expect } from "vitest";
import { buildSearchContext, buildActivitySearchContext, SURFACE_CONFIGS } from "../surfaceConfig";

describe("surfaceConfig", () => {
  describe("SURFACE_CONFIGS", () => {
    it("defines all SearchSurface values", () => {
      expect(SURFACE_CONFIGS.global).toBeDefined();
      expect(SURFACE_CONFIGS.library).toBeDefined();
      expect(SURFACE_CONFIGS.shelf).toBeDefined();
      expect(SURFACE_CONFIGS.onboarding).toBeDefined();
      expect(SURFACE_CONFIGS.entity).toBeDefined();
    });

    it("global surface does not prefer owned library", () => {
      expect(SURFACE_CONFIGS.global.preferOwnedLibrary).toBe(false);
    });

    it("library surface prefers owned library", () => {
      expect(SURFACE_CONFIGS.library.preferOwnedLibrary).toBe(true);
    });

    it("shelf surface prefers owned library", () => {
      expect(SURFACE_CONFIGS.shelf.preferOwnedLibrary).toBe(true);
    });
  });

  describe("buildSearchContext", () => {
    it("builds a global context with correct surface", () => {
      const ctx = buildSearchContext("global");
      expect(ctx.surface).toBe("global");
      expect(ctx.preferOwnedLibrary).toBe(false);
      expect(ctx.currentUserId).toBeUndefined();
    });

    it("builds a library context with currentUserId", () => {
      const ctx = buildSearchContext("library", { currentUserId: "user-1" });
      expect(ctx.surface).toBe("library");
      expect(ctx.preferOwnedLibrary).toBe(true);
      expect(ctx.currentUserId).toBe("user-1");
    });

    it("builds a shelf context with activeShelfId", () => {
      const ctx = buildSearchContext("shelf", { activeShelfId: "shelf-42", currentUserId: "user-1" });
      expect(ctx.surface).toBe("shelf");
      expect(ctx.activeShelfId).toBe("shelf-42");
      expect(ctx.currentUserId).toBe("user-1");
    });

    it("allows overriding entityTypeHint", () => {
      const ctx = buildSearchContext("entity", { entityTypeHint: "author" });
      expect(ctx.entityTypeHint).toBe("author");
    });

    it("uses config default entityTypeHint when not overridden", () => {
      const ctx = buildSearchContext("global");
      expect(ctx.entityTypeHint).toBeUndefined();
    });
  });

  describe("buildActivitySearchContext", () => {
    it("uses global surface for activity", () => {
      const ctx = buildActivitySearchContext("user-1");
      expect(ctx.surface).toBe("global");
      expect(ctx.currentUserId).toBe("user-1");
      expect(ctx.preferOwnedLibrary).toBe(false);
    });

    it("works without currentUserId", () => {
      const ctx = buildActivitySearchContext();
      expect(ctx.surface).toBe("global");
      expect(ctx.currentUserId).toBeUndefined();
    });
  });
});
