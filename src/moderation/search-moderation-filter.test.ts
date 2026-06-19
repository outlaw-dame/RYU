import { describe, expect, it } from "vitest";
import { shouldExcludeFromSearch, filterSearchResults } from "./search-moderation-filter";
import type { SearchModerationInput, SearchModerationState } from "./search-moderation-filter";
import type { PolicyAccount, PolicyDomain, PolicyFilter } from "./policy-types";

function makeState(overrides: Partial<SearchModerationState> = {}): SearchModerationState {
  return {
    blockedAccounts: [],
    mutedAccounts: [],
    blockedDomains: [],
    filters: [],
    ...overrides
  };
}

function makeBlockedAccount(accountId: string): PolicyAccount {
  return {
    id: `block-${accountId}`,
    accountId,
    action: "block",
    hideNotifications: true,
    expiresAt: null,
    source: "local",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  };
}

function makeMutedAccount(accountId: string, expiresAt: string | null = null): PolicyAccount {
  return {
    id: `mute-${accountId}`,
    accountId,
    action: "mute",
    hideNotifications: true,
    expiresAt,
    source: "local",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  };
}

function makeBlockedDomain(domain: string): PolicyDomain {
  return {
    id: `dom-${domain}`,
    domain,
    severity: "block",
    source: "local",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  };
}

function makeHideFilter(keyword: string): PolicyFilter {
  return {
    id: `filter-${keyword}`,
    title: `Hide ${keyword}`,
    keywords: [{ id: "k1", keyword, wholeWord: false }],
    contexts: ["public"],
    action: "hide",
    expiresAt: null,
    source: "local",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  };
}

describe("search-moderation-filter", () => {
  describe("shouldExcludeFromSearch", () => {
    it("excludes results from blocked accounts", () => {
      const state = makeState({ blockedAccounts: [makeBlockedAccount("bad-user")] });
      expect(shouldExcludeFromSearch({ accountId: "bad-user" }, state)).toBe(true);
    });

    it("does not exclude results from non-blocked accounts", () => {
      const state = makeState({ blockedAccounts: [makeBlockedAccount("bad-user")] });
      expect(shouldExcludeFromSearch({ accountId: "good-user" }, state)).toBe(false);
    });

    it("excludes results from muted accounts", () => {
      const state = makeState({ mutedAccounts: [makeMutedAccount("muted-user")] });
      expect(shouldExcludeFromSearch({ accountId: "muted-user" }, state)).toBe(true);
    });

    it("does not exclude results from muted accounts with expired mute", () => {
      const state = makeState({
        mutedAccounts: [makeMutedAccount("muted-user", "2020-01-01T00:00:00Z")]
      });
      expect(shouldExcludeFromSearch({ accountId: "muted-user" }, state)).toBe(false);
    });

    it("excludes results from blocked domains", () => {
      const state = makeState({ blockedDomains: [makeBlockedDomain("spam.tld")] });
      expect(shouldExcludeFromSearch({ domain: "spam.tld" }, state)).toBe(true);
    });

    it("excludes results from blocked domains via acct", () => {
      const state = makeState({ blockedDomains: [makeBlockedDomain("spam.tld")] });
      expect(shouldExcludeFromSearch({ acct: "user@spam.tld" }, state)).toBe(true);
    });

    it("excludes results from blocked domains via instanceHost", () => {
      const state = makeState({ blockedDomains: [makeBlockedDomain("spam.tld")] });
      expect(shouldExcludeFromSearch({ instanceHost: "spam.tld" }, state)).toBe(true);
    });

    it("excludes results matching hide filters with public context", () => {
      const state = makeState({ filters: [makeHideFilter("spoiler")] });
      expect(shouldExcludeFromSearch({ text: "major spoiler ahead" }, state)).toBe(true);
    });

    it("does not exclude results matching warn filters", () => {
      const filter: PolicyFilter = {
        ...makeHideFilter("spoiler"),
        action: "warn"
      };
      const state = makeState({ filters: [filter] });
      expect(shouldExcludeFromSearch({ text: "spoiler content" }, state)).toBe(false);
    });

    it("does not exclude results when filter context does not include public", () => {
      const filter: PolicyFilter = {
        ...makeHideFilter("spoiler"),
        contexts: ["home"]
      };
      const state = makeState({ filters: [filter] });
      expect(shouldExcludeFromSearch({ text: "spoiler content" }, state)).toBe(false);
    });

    it("returns false when no moderation rules match", () => {
      expect(shouldExcludeFromSearch({ accountId: "user", text: "clean" }, makeState())).toBe(false);
    });
  });

  describe("filterSearchResults", () => {
    it("removes moderated content from results", () => {
      const results: SearchModerationInput[] = [
        { accountId: "good-user", text: "good content" },
        { accountId: "bad-user", text: "also content" },
        { accountId: "good-user-2", text: "more good content" }
      ];
      const state = makeState({ blockedAccounts: [makeBlockedAccount("bad-user")] });
      const filtered = filterSearchResults(results, state);
      expect(filtered).toHaveLength(2);
      expect(filtered.every((r) => r.accountId !== "bad-user")).toBe(true);
    });

    it("no-leakage: blocked accounts never appear in search", () => {
      const results: SearchModerationInput[] = [
        { accountId: "blocked-1", text: "content from blocked" },
        { accountId: "blocked-1", domain: "other.tld", text: "more from blocked" },
        { accountId: "normal", text: "normal content" }
      ];
      const state = makeState({ blockedAccounts: [makeBlockedAccount("blocked-1")] });
      const filtered = filterSearchResults(results, state);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].accountId).toBe("normal");
    });

    it("no-leakage: muted accounts never appear in search", () => {
      const results: SearchModerationInput[] = [
        { accountId: "muted-1", text: "content from muted" },
        { accountId: "normal", text: "normal content" }
      ];
      const state = makeState({ mutedAccounts: [makeMutedAccount("muted-1")] });
      const filtered = filterSearchResults(results, state);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].accountId).toBe("normal");
    });

    it("no-leakage: blocked domain content never appears in search", () => {
      const results: SearchModerationInput[] = [
        { accountId: "user-1", domain: "spam.tld", text: "spam content" },
        { accountId: "user-2", domain: "good.tld", text: "good content" }
      ];
      const state = makeState({ blockedDomains: [makeBlockedDomain("spam.tld")] });
      const filtered = filterSearchResults(results, state);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].domain).toBe("good.tld");
    });
  });
});
