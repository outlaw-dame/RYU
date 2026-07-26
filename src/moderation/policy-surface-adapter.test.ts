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

  it("fails closed when content identity is missing", () => {
    const result = evaluateStatusForSurface(
      status({ account: { id: "" } }),
      emptyState,
      { surface: "home" }
    );

    expect(result.hidden).toBe(true);
    expect(result.decision.action).toBe("hide");
    expect(result.decision.reasons).toEqual(["Invalid content identity"]);
  });

  it("applies account blocks before rendering", () => {
    const result = evaluateStatusForSurface(status(), {
      ...emptyState,
      accounts: [{
        id: "block-42",
        accountId: "42",
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

  it("preserves warned items for an intervention UI instead of dropping them", () => {
    const result = evaluateStatusForSurface(status({ content: "spoiler ahead" }), {
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
    }, { surface: "home" });

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
