import { describe, expect, it } from "vitest";
import {
  evaluatePolicy,
  matchesFilterKeywords,
  isFilterExpired,
  createSafetyLabel,
  BOOK_SAFETY_LABELS,
  normalizeMastodonFilter,
  normalizeMastodonRelationship
} from "./policy-engine";
import type { PolicyInput, PolicyStoreState } from "./policy-engine";
import type {
  PolicyFilter,
  PolicyAccount,
  PolicyDomain,
  PolicyRelationship,
  PolicyEvaluationContext
} from "./policy-types";

function emptyState(): PolicyStoreState {
  return { accounts: [], domains: [], filters: [], relationships: [] };
}

function makeFilter(overrides: Partial<PolicyFilter> = {}): PolicyFilter {
  return {
    id: "f1",
    title: "Test Filter",
    keywords: [{ id: "kw1", keyword: "spoiler", wholeWord: false }],
    contexts: ["home", "public"],
    action: "hide",
    expiresAt: null,
    source: "local",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides
  };
}

function makeAccount(overrides: Partial<PolicyAccount> = {}): PolicyAccount {
  return {
    id: "acc1",
    accountId: "user-123",
    action: "block",
    hideNotifications: true,
    expiresAt: null,
    source: "local",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides
  };
}

function makeDomain(overrides: Partial<PolicyDomain> = {}): PolicyDomain {
  return {
    id: "dom1",
    domain: "spam.tld",
    severity: "block",
    source: "local",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides
  };
}

const baseInput: PolicyInput = {
  accountId: "user-123",
  acct: "user@instance.tld",
  content: "Hello world",
  sensitive: false,
  spoilerText: ""
};

const homeContext: PolicyEvaluationContext = { surface: "home" };
const searchContext: PolicyEvaluationContext = { surface: "search" };
const notifContext: PolicyEvaluationContext = { surface: "notifications" };

describe("policy-engine", () => {
  describe("evaluatePolicy", () => {
    it("returns show for clean content with no rules", () => {
      const result = evaluatePolicy(baseInput, emptyState(), homeContext);
      expect(result.action).toBe("show");
      expect(result.reasons).toEqual([]);
    });

    it("returns hide for blocked accounts", () => {
      const state = { ...emptyState(), accounts: [makeAccount()] };
      const result = evaluatePolicy(baseInput, state, homeContext);
      expect(result.action).toBe("hide");
      expect(result.reasons).toContain("Account is blocked");
    });

    it("returns hide for domain-blocked accounts", () => {
      const input = { ...baseInput, accountId: "other", acct: "user@spam.tld" };
      const state = { ...emptyState(), domains: [makeDomain()] };
      const result = evaluatePolicy(input, state, homeContext);
      expect(result.action).toBe("hide");
      expect(result.reasons).toContain("Domain is blocked");
    });

    it("returns hide for domain hidden from discovery in search context", () => {
      const input = { ...baseInput, accountId: "other", acct: "user@hidden.tld" };
      const state = {
        ...emptyState(),
        domains: [makeDomain({ domain: "hidden.tld", severity: "hide_from_discovery" })]
      };
      const result = evaluatePolicy(input, state, searchContext);
      expect(result.action).toBe("hide");
    });

    it("does not hide domain from discovery in home context", () => {
      const input = { ...baseInput, accountId: "other", acct: "user@hidden.tld" };
      const state = {
        ...emptyState(),
        domains: [makeDomain({ domain: "hidden.tld", severity: "hide_from_discovery" })]
      };
      const result = evaluatePolicy(input, state, homeContext);
      expect(result.action).toBe("show");
    });

    it("returns collapse for muted accounts on home", () => {
      const state = {
        ...emptyState(),
        accounts: [makeAccount({ action: "mute" })]
      };
      const result = evaluatePolicy(baseInput, state, homeContext);
      expect(result.action).toBe("collapse");
      expect(result.reasons).toContain("Account is muted");
    });

    it("returns hide for muted accounts on notifications when hideNotifications", () => {
      const state = {
        ...emptyState(),
        accounts: [makeAccount({ action: "mute", hideNotifications: true })]
      };
      const result = evaluatePolicy(baseInput, state, notifContext);
      expect(result.action).toBe("hide");
    });

    it("passes muted accounts on notifications when hideNotifications is false", () => {
      const state = {
        ...emptyState(),
        accounts: [makeAccount({ action: "mute", hideNotifications: false })]
      };
      const result = evaluatePolicy(baseInput, state, notifContext);
      expect(result.action).toBe("show");
    });

    it("respects mute expiry", () => {
      const state = {
        ...emptyState(),
        accounts: [makeAccount({ action: "mute", expiresAt: "2020-01-01T00:00:00Z" })]
      };
      const result = evaluatePolicy(baseInput, state, homeContext);
      expect(result.action).toBe("show");
    });

    it("applies keyword filters by context", () => {
      const filter = makeFilter({ contexts: ["home"] });
      const state = { ...emptyState(), filters: [filter] };
      const input = { ...baseInput, accountId: "other", content: "big spoiler alert" };
      const result = evaluatePolicy(input, state, homeContext);
      expect(result.action).toBe("hide");
      expect(result.matchedFilters).toHaveLength(1);
    });

    it("does not apply filter outside its context", () => {
      const filter = makeFilter({ contexts: ["home"] });
      const state = { ...emptyState(), filters: [filter] };
      const input = { ...baseInput, accountId: "other", content: "big spoiler alert" };
      const result = evaluatePolicy(input, state, notifContext);
      expect(result.action).toBe("show");
    });

    it("applies warn action from filter", () => {
      const filter = makeFilter({ action: "warn" });
      const state = { ...emptyState(), filters: [filter] };
      const input = { ...baseInput, accountId: "other", content: "spoiler warning" };
      const result = evaluatePolicy(input, state, homeContext);
      expect(result.action).toBe("warn");
    });

    it("applies blur action from filter", () => {
      const filter = makeFilter({ action: "blur" });
      const state = { ...emptyState(), filters: [filter] };
      const input = { ...baseInput, accountId: "other", content: "spoiler content" };
      const result = evaluatePolicy(input, state, homeContext);
      expect(result.action).toBe("blur");
    });

    it("returns blur for sensitive content", () => {
      const input = { ...baseInput, sensitive: true };
      const result = evaluatePolicy(input, emptyState(), homeContext);
      expect(result.action).toBe("blur");
    });

    it("returns warn for content with spoiler text", () => {
      const input = { ...baseInput, spoilerText: "Book ending reveal" };
      const result = evaluatePolicy(input, emptyState(), homeContext);
      expect(result.action).toBe("warn");
    });

    it("applies safety labels - hide severity", () => {
      const input: PolicyInput = {
        ...baseInput,
        safetyLabels: [createSafetyLabel("hate", "hide", 0.95)]
      };
      const result = evaluatePolicy(input, emptyState(), homeContext);
      expect(result.action).toBe("hide");
    });

    it("applies safety labels - warn severity", () => {
      const input: PolicyInput = {
        ...baseInput,
        safetyLabels: [createSafetyLabel("spoiler", "warn", 0.8)]
      };
      const result = evaluatePolicy(input, emptyState(), homeContext);
      expect(result.action).toBe("warn");
    });

    it("prioritizes blocks over mutes", () => {
      const state = {
        ...emptyState(),
        accounts: [
          makeAccount({ id: "a1", action: "block" }),
          makeAccount({ id: "a2", action: "mute" })
        ]
      };
      const result = evaluatePolicy(baseInput, state, homeContext);
      expect(result.action).toBe("hide");
      expect(result.reasons).toContain("Account is blocked");
    });

    it("uses relationship data for blocking", () => {
      const rel: PolicyRelationship = {
        id: "rel1",
        accountId: "user-123",
        following: false,
        followedBy: false,
        blocking: true,
        blockedBy: false,
        muting: false,
        mutingNotifications: false,
        requested: false,
        requestedBy: false,
        domainBlocking: false,
        endorsed: false,
        mutingExpiresAt: null,
        instanceOrigin: "https://instance.tld",
        ownerAccountId: "me",
        syncedAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z"
      };
      const state = { ...emptyState(), relationships: [rel] };
      const result = evaluatePolicy(baseInput, state, homeContext);
      expect(result.action).toBe("hide");
    });
  });

  describe("matchesFilterKeywords", () => {
    it("matches substring keywords", () => {
      const filter = makeFilter({
        keywords: [{ id: "k1", keyword: "spoiler", wholeWord: false }]
      });
      expect(matchesFilterKeywords("contains spoiler text", filter)).toBe(true);
      expect(matchesFilterKeywords("no match here", filter)).toBe(false);
    });

    it("matches whole-word keywords", () => {
      const filter = makeFilter({
        keywords: [{ id: "k1", keyword: "cat", wholeWord: true }]
      });
      expect(matchesFilterKeywords("I love my cat", filter)).toBe(true);
      expect(matchesFilterKeywords("concatenation", filter)).toBe(false);
    });

    it("matches case-insensitively", () => {
      const filter = makeFilter({
        keywords: [{ id: "k1", keyword: "SPAM", wholeWord: false }]
      });
      expect(matchesFilterKeywords("this is spam", filter)).toBe(true);
    });

    it("handles non-ASCII whole-word matching", () => {
      const filter = makeFilter({
        keywords: [{ id: "k1", keyword: "\u732B", wholeWord: true }]
      });
      expect(matchesFilterKeywords("\u79C1\u306E\u732B\u306F\u304B\u308F\u3044\u3044", filter)).toBe(true);
      expect(matchesFilterKeywords("\u732B\u8033", filter)).toBe(false);
    });

    it("handles non-ASCII without whole-word", () => {
      const filter = makeFilter({
        keywords: [{ id: "k1", keyword: "\u732B", wholeWord: false }]
      });
      expect(matchesFilterKeywords("\u732B\u8033", filter)).toBe(true);
    });

    it("does not match expired filters", () => {
      const filter = makeFilter({ expiresAt: "2020-01-01T00:00:00Z" });
      expect(matchesFilterKeywords("spoiler", filter)).toBe(false);
    });

    it("escapes regex special characters", () => {
      const filter = makeFilter({
        keywords: [{ id: "k1", keyword: "hello (world)", wholeWord: false }]
      });
      expect(matchesFilterKeywords("say hello (world)!", filter)).toBe(true);
      expect(matchesFilterKeywords("hello world", filter)).toBe(false);
    });

    it("matches multiple keywords (any match)", () => {
      const filter = makeFilter({
        keywords: [
          { id: "k1", keyword: "spoiler", wholeWord: false },
          { id: "k2", keyword: "leak", wholeWord: false }
        ]
      });
      expect(matchesFilterKeywords("this is a leak", filter)).toBe(true);
      expect(matchesFilterKeywords("big spoiler", filter)).toBe(true);
      expect(matchesFilterKeywords("no match", filter)).toBe(false);
    });
  });

  describe("isFilterExpired", () => {
    it("returns false for null expiresAt", () => {
      const filter = makeFilter({ expiresAt: null });
      expect(isFilterExpired(filter)).toBe(false);
    });

    it("returns true for past date", () => {
      const filter = makeFilter({ expiresAt: "2020-01-01T00:00:00Z" });
      expect(isFilterExpired(filter)).toBe(true);
    });

    it("returns false for future date", () => {
      const filter = makeFilter({ expiresAt: "2099-01-01T00:00:00Z" });
      expect(isFilterExpired(filter)).toBe(false);
    });
  });

  describe("normalizeMastodonFilter", () => {
    it("normalizes a Mastodon v2 filter", () => {
      const result = normalizeMastodonFilter({
        id: "42",
        title: "No Spoilers",
        keywords: [{ id: "1", keyword: "spoiler", whole_word: true }],
        context: ["home", "public"],
        filter_action: "warn",
        expires_at: null
      }, "https://mastodon.social", "user-1");

      expect(result.id).toBe("remote:https://mastodon.social:42");
      expect(result.title).toBe("No Spoilers");
      expect(result.keywords).toHaveLength(1);
      expect(result.keywords[0].wholeWord).toBe(true);
      expect(result.contexts).toEqual(["home", "public"]);
      expect(result.action).toBe("warn");
      expect(result.source).toBe("remote");
    });

    it("accepts blur as a valid filter_action", () => {
      const result = normalizeMastodonFilter({
        id: "43",
        title: "Blur Test",
        keywords: [{ id: "2", keyword: "nsfw", whole_word: false }],
        context: ["public"],
        filter_action: "blur",
        expires_at: null
      }, "https://mastodon.social", "user-1");

      expect(result.action).toBe("blur");
    });

    it("defaults unknown filter_action to warn", () => {
      const result = normalizeMastodonFilter({
        id: "44",
        title: "Unknown",
        keywords: [],
        context: [],
        filter_action: "unknown_action",
        expires_at: null
      }, "https://mastodon.social", "user-1");

      expect(result.action).toBe("warn");
    });
  });

  describe("normalizeMastodonRelationship", () => {
    it("normalizes a relationship response", () => {
      const result = normalizeMastodonRelationship({
        id: "acc-42",
        following: true,
        followed_by: true,
        blocking: false,
        blocked_by: false,
        muting: false,
        muting_notifications: false,
        requested: false,
        domain_blocking: false,
        endorsed: false,
        muting_expires_at: null
      }, "https://mastodon.social", "me-1");

      expect(result.id).toBe("rel:https://mastodon.social:acc-42");
      expect(result.accountId).toBe("acc-42");
      expect(result.following).toBe(true);
      expect(result.followedBy).toBe(true);
      expect(result.blocking).toBe(false);
      expect(result.mutingExpiresAt).toBeNull();
    });
  });

  describe("BOOK_SAFETY_LABELS", () => {
    it("contains all required book safety label types", () => {
      expect(BOOK_SAFETY_LABELS.spoiler).toBeDefined();
      expect(BOOK_SAFETY_LABELS.explicit_sexual).toBeDefined();
      expect(BOOK_SAFETY_LABELS.graphic_violence).toBeDefined();
      expect(BOOK_SAFETY_LABELS.abuse_harassment).toBeDefined();
      expect(BOOK_SAFETY_LABELS.hate).toBeDefined();
      expect(BOOK_SAFETY_LABELS.spam_scam).toBeDefined();
      expect(BOOK_SAFETY_LABELS.ai_generated_slop).toBeDefined();
      expect(BOOK_SAFETY_LABELS.review_bombing).toBeDefined();
      expect(BOOK_SAFETY_LABELS.unsafe_links).toBeDefined();
    });
  });
});
