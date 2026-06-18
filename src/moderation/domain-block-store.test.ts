import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadDomainBlockList,
  addDomainBlock,
  removeDomainBlock,
  isDomainBlocked,
  isAccountDomainBlocked,
  extractDomain,
  normalizeDomain
} from "./domain-block-store";

describe("domain-block-store", () => {
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

  describe("normalizeDomain", () => {
    it("lowercases and trims", () => {
      expect(normalizeDomain("  Example.COM  ")).toBe("example.com");
    });
  });

  describe("extractDomain", () => {
    it("extracts domain from user@domain format", () => {
      expect(extractDomain("user@instance.tld")).toBe("instance.tld");
    });

    it("extracts domain from @user@domain format", () => {
      expect(extractDomain("@user@instance.tld")).toBe("instance.tld");
    });

    it("returns undefined for local accounts (no @)", () => {
      expect(extractDomain("localuser")).toBeUndefined();
    });

    it("returns undefined for undefined input", () => {
      expect(extractDomain(undefined)).toBeUndefined();
    });
  });

  describe("loadDomainBlockList", () => {
    it("returns empty array when no data", () => {
      expect(loadDomainBlockList()).toEqual([]);
    });

    it("returns empty array for invalid JSON", () => {
      mockStorage.set("ryu:domain-block-list", "bad");
      expect(loadDomainBlockList()).toEqual([]);
    });
  });

  describe("addDomainBlock", () => {
    it("adds a domain block", () => {
      const result = addDomainBlock("spam.instance.tld");
      expect(result).toHaveLength(1);
      expect(result[0].domain).toBe("spam.instance.tld");
    });

    it("normalizes domain", () => {
      const result = addDomainBlock("  SPAM.Instance.TLD  ");
      expect(result[0].domain).toBe("spam.instance.tld");
    });

    it("does not duplicate", () => {
      addDomainBlock("spam.tld");
      const result = addDomainBlock("spam.tld");
      expect(result).toHaveLength(1);
    });

    it("stores reason", () => {
      const result = addDomainBlock("spam.tld", "Known spam instance");
      expect(result[0].reason).toBe("Known spam instance");
    });
  });

  describe("removeDomainBlock", () => {
    it("removes a domain block", () => {
      addDomainBlock("spam.tld");
      addDomainBlock("bad.tld");
      const result = removeDomainBlock("spam.tld");
      expect(result).toHaveLength(1);
      expect(result[0].domain).toBe("bad.tld");
    });
  });

  describe("isDomainBlocked", () => {
    it("returns true for blocked domains", () => {
      addDomainBlock("spam.tld");
      expect(isDomainBlocked("spam.tld")).toBe(true);
    });

    it("returns true case-insensitively", () => {
      addDomainBlock("spam.tld");
      expect(isDomainBlocked("SPAM.TLD")).toBe(true);
    });

    it("returns false for non-blocked domains", () => {
      expect(isDomainBlocked("good.tld")).toBe(false);
    });
  });

  describe("isAccountDomainBlocked", () => {
    it("returns true when account domain is blocked", () => {
      addDomainBlock("spam.tld");
      expect(isAccountDomainBlocked("baduser@spam.tld")).toBe(true);
    });

    it("returns false when account domain is not blocked", () => {
      addDomainBlock("spam.tld");
      expect(isAccountDomainBlocked("gooduser@legit.tld")).toBe(false);
    });

    it("returns false for local accounts", () => {
      addDomainBlock("spam.tld");
      expect(isAccountDomainBlocked("localuser")).toBe(false);
    });

    it("returns false for undefined acct", () => {
      expect(isAccountDomainBlocked(undefined)).toBe(false);
    });
  });
});
