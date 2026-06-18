import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateModeration, shouldHideContent, shouldWarnContent } from "./moderation-engine";
import type { ModerationInput, ModerationContext } from "./moderation-engine";
import { addBlock, removeBlock } from "./block-store";
import { addMute, removeMute } from "./mute-store";
import { addDomainBlock, removeDomainBlock } from "./domain-block-store";
import { addContentFilter } from "./content-filter";
import { saveSafeSearchLevel } from "./safe-search";

describe("moderation-engine", () => {
  const mockStorage = new Map<string, string>();

  beforeEach(() => {
    mockStorage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mockStorage.get(key) ?? null,
      setItem: (key: string, value: string) => { mockStorage.set(key, value); },
      removeItem: (key: string) => { mockStorage.delete(key); }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const baseInput: ModerationInput = {
    accountId: "user-123",
    acct: "user@instance.tld",
    content: "Hello, world!",
    sensitive: false,
    spoilerText: ""
  };

  describe("evaluateModeration", () => {
    it("returns show for clean content with no rules", () => {
      const result = evaluateModeration(baseInput);
      expect(result.decision).toBe("show");
      expect(result.reasons).toEqual([]);
    });

    it("returns hide for blocked accounts", () => {
      addBlock("user-123");
      const result = evaluateModeration(baseInput);
      expect(result.decision).toBe("hide");
      expect(result.reasons).toContain("Account is blocked");
    });

    it("returns hide for domain-blocked accounts", () => {
      addDomainBlock("instance.tld");
      const result = evaluateModeration(baseInput);
      expect(result.decision).toBe("hide");
      expect(result.reasons).toContain("Domain is blocked");
    });

    it("returns hide for muted accounts on timeline", () => {
      addMute("user-123");
      const result = evaluateModeration(baseInput, { surface: "timeline" });
      expect(result.decision).toBe("hide");
      expect(result.reasons).toContain("Account is muted");
    });

    it("returns hide for muted accounts on search surface", () => {
      addMute("user-123");
      const result = evaluateModeration(baseInput, { surface: "search" });
      expect(result.decision).toBe("hide");
      expect(result.reasons).toContain("Account is muted");
    });

    it("returns hide for muted accounts on notifications when hideNotifications is true", () => {
      addMute("user-123", { hideNotifications: true });
      const result = evaluateModeration(baseInput, { surface: "notifications" });
      expect(result.decision).toBe("hide");
    });

    it("allows muted accounts on notifications when hideNotifications is false", () => {
      addMute("user-123", { hideNotifications: false });
      const result = evaluateModeration(baseInput, { surface: "notifications" });
      expect(result.decision).toBe("show");
    });

    it("returns hide for content filter with hide action", () => {
      addContentFilter("world", { action: "hide" });
      const input: ModerationInput = { ...baseInput, accountId: "other-user" };
      const result = evaluateModeration(input);
      expect(result.decision).toBe("hide");
      expect(result.matchedFilter).toBeDefined();
      expect(result.matchedFilter!.phrase).toBe("world");
    });

    it("returns warn for content filter with warn action", () => {
      addContentFilter("world", { action: "warn" });
      const input: ModerationInput = { ...baseInput, accountId: "other-user" };
      const result = evaluateModeration(input);
      expect(result.decision).toBe("warn");
    });

    it("returns blur for content filter with blur action", () => {
      addContentFilter("world", { action: "blur" });
      const input: ModerationInput = { ...baseInput, accountId: "other-user" };
      const result = evaluateModeration(input);
      expect(result.decision).toBe("blur");
    });

    it("returns blur for sensitive content in strict mode", () => {
      saveSafeSearchLevel("strict");
      const input: ModerationInput = { ...baseInput, sensitive: true };
      const result = evaluateModeration(input);
      expect(result.decision).toBe("blur");
      expect(result.reasons).toContain("Content is marked sensitive");
    });

    it("returns warn for content with spoiler text in off mode", () => {
      saveSafeSearchLevel("off");
      const input: ModerationInput = { ...baseInput, spoilerText: "book spoiler" };
      const result = evaluateModeration(input);
      expect(result.decision).toBe("warn");
      expect(result.reasons).toContain("Content has a content warning");
    });

    it("prioritizes blocks over mutes", () => {
      addBlock("user-123");
      addMute("user-123");
      const result = evaluateModeration(baseInput);
      expect(result.decision).toBe("hide");
      expect(result.reasons).toContain("Account is blocked");
    });

    it("prioritizes blocks over content filters", () => {
      addBlock("user-123");
      addContentFilter("Hello", { action: "warn" });
      const result = evaluateModeration(baseInput);
      expect(result.decision).toBe("hide");
      expect(result.reasons).toContain("Account is blocked");
    });
  });

  describe("shouldHideContent", () => {
    it("returns true when decision is hide", () => {
      addBlock("user-123");
      expect(shouldHideContent(baseInput)).toBe(true);
    });

    it("returns false when decision is show", () => {
      expect(shouldHideContent(baseInput)).toBe(false);
    });

    it("returns false when decision is warn", () => {
      const input: ModerationInput = { ...baseInput, spoilerText: "cw" };
      saveSafeSearchLevel("off");
      expect(shouldHideContent(input)).toBe(false);
    });
  });

  describe("shouldWarnContent", () => {
    it("returns true when decision is warn", () => {
      saveSafeSearchLevel("off");
      const input: ModerationInput = { ...baseInput, spoilerText: "cw text" };
      expect(shouldWarnContent(input)).toBe(true);
    });

    it("returns true when decision is blur", () => {
      saveSafeSearchLevel("strict");
      const input: ModerationInput = { ...baseInput, sensitive: true };
      expect(shouldWarnContent(input)).toBe(true);
    });

    it("returns false when decision is show", () => {
      expect(shouldWarnContent(baseInput)).toBe(false);
    });
  });
});
