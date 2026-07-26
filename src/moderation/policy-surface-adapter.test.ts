import { describe, expect, it } from "vitest";
import {
  applyPolicyToSurface,
  evaluateStatusForSurface,
  statusToPolicyInput
} from "./policy-surface-adapter";
import type { PolicyStoreState } from "./policy-engine";

const emptyState: PolicyStoreState = {
  accounts: [],
  domains: [],
  filters: [],
  relationships: []
};

function status(overrides: Record<string, unknown> = {}) {
  return {
    account: { id: "42", acct: "reader@books.example", display_name: "Reader" },
    content: "<p>Hello world</p>",
    sensitive: false,
    spoiler_text: "",
    ...overrides
  };
}

function spoilerFilterState(): PolicyStoreState {
  return {
    ...emptyState,
    filters: [{
      id: "filter-1",
      title: "Spoilers",
      keywords: [{ id: "keyword-1", keyword: "spoiler", wholeWord: true }],
      contexts: ["home"],
      action: "warn",
      expiresAt: null,
      source: "local",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }]
  };
}

describe("policy surface adapter", () => {
  it("normalizes Mastodon status content into policy input", () => {
    expect(statusToPolicyInput(status())).toEqual({
      accountId: "42",
      acct: "reader@books.example",
      content: "Hello world",
      sensitive: false,
      spoilerText: undefined,
      authorName: "Reader"
    });
  });

  it("preserves word boundaries across adjacent block elements", () => {
    const input = statusToPolicyInput(status({ content: "<p>safe</p><p>spoiler</p>" }));
    expect(input?.content).toBe("safe spoiler");
    const result = evaluateStatusForSurface(
      status({ content: "<p>safe</p><p>spoiler</p>" }),
      spoilerFilterState(),
      { surface: "home" }
    );
    expect(result.decision.action).toBe("warn");
  });

  it("fails closed when content identity is missing", () => {
    const result = evaluateStatusForSurface(
      status({ account: { id: "" } }),
      emptyState,
      { surface: "home" }
    );
    expect(result.hidden).toBe(true);
    expect(result.decision.reasons).toEqual(["Invalid or oversized content identity"]);
  });

  it("fails closed rather than truncating oversized content", () => {
    const result = evaluateStatusForSurface(
      status({ content: `safe${"x".repeat(20_000)}spoiler` }),
      spoilerFilterState(),
      { surface: "home" }
    );
    expect(result.hidden).toBe(true);
    expect(result.decision.action).toBe("hide");
  });

  it("evaluates both the booster and original status", () => {
    const result = evaluateStatusForSurface(status({
      content: "",
      reblog: status({
        account: { id: "blocked-original", acct: "blocked@books.example" },
        content: "<p>Original content</p>"
      })
    }), {
      ...emptyState,
      accounts: [{
        id: "block-original",
        accountId: "blocked-original",
        action: "block",
        hideNotifications: true,
        expiresAt: null,
        source: "local",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }]
    }, { surface: "home" });

    expect(result.hidden).toBe(true);
    expect(result.decision.action).toBe("hide");
  });

  it("preserves warned items for intervention UI", () => {
    const result = evaluateStatusForSurface(
      status({ content: "spoiler ahead" }),
      spoilerFilterState(),
      { surface: "home" }
    );
    expect(result.hidden).toBe(false);
    expect(result.requiresIntervention).toBe(true);
    expect(result.decision.action).toBe("warn");
  });

  it("rejects unbounded batches before allocating result state", () => {
    const items = Array.from({ length: 5_001 }, () => status());
    expect(() => applyPolicyToSurface(items, emptyState, { surface: "public" }))
      .toThrow(RangeError);
  });
});
