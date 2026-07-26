import { describe, expect, it } from "vitest";
import type { MastodonStatus } from "../sync/mastodon-client";
import type { PolicyDecision } from "./policy-types";
import type { PolicySurfaceResult } from "./policy-surface-adapter";
import {
  buildBookActivityContentIdentity,
  buildBookActivityRenderKey,
  projectBookActivityPolicy
} from "./book-activity-policy";

const showDecision: PolicyDecision = {
  action: "show",
  reasons: [],
  matchedFilters: [],
  safetyLabels: []
};

const warnDecision: PolicyDecision = {
  action: "warn",
  reasons: ["Content warning"],
  matchedFilters: [],
  safetyLabels: []
};

const hideDecision: PolicyDecision = {
  action: "hide",
  reasons: ["Blocked account"],
  matchedFilters: [],
  safetyLabels: []
};

function status(id: string, content = `<p>${id}</p>`): MastodonStatus {
  return {
    id,
    created_at: "2026-07-26T00:00:00.000Z",
    account: { id: `account-${id}`, acct: `${id}@books.example` },
    content,
    sensitive: false,
    spoiler_text: ""
  };
}

function result(
  item: MastodonStatus,
  decision: PolicyDecision,
  hidden = decision.action === "hide"
): PolicySurfaceResult<MastodonStatus> {
  return {
    item,
    decision,
    hidden,
    requiresIntervention: decision.action !== "show"
  };
}

describe("book activity policy projection", () => {
  it("removes hard-hidden statuses before downstream classification", () => {
    const visible = status("visible");
    const hidden = status("hidden");

    const projection = projectBookActivityPolicy([
      result(visible, showDecision),
      result(hidden, hideDecision)
    ]);

    expect(projection.visibleStatuses).toEqual([visible]);
    expect(projection.decisionByStatus.get(visible)).toBe(showDecision);
    expect(projection.decisionByStatus.has(hidden)).toBe(false);
  });

  it("preserves warning decisions for the intervention gate", () => {
    const warned = status("warned");
    const projection = projectBookActivityPolicy([result(warned, warnDecision)]);

    expect(projection.visibleStatuses).toEqual([warned]);
    expect(projection.decisionByStatus.get(warned)).toBe(warnDecision);
  });

  it("keys decisions by object identity rather than federated status ID", () => {
    const first = status("same-id", "<p>first</p>");
    const second = status("same-id", "<p>second</p>");
    const projection = projectBookActivityPolicy([
      result(first, showDecision),
      result(second, warnDecision)
    ]);

    expect(projection.visibleStatuses).toEqual([first, second]);
    expect(projection.decisionByStatus.get(first)).toBe(showDecision);
    expect(projection.decisionByStatus.get(second)).toBe(warnDecision);
  });

  it("scopes React keys beyond the server-local status ID", () => {
    const first = status("same-id");
    const second = {
      ...first,
      account: { ...first.account, id: "another-instance-account" }
    };

    expect(buildBookActivityRenderKey(first))
      .not.toBe(buildBookActivityRenderKey(second));
  });

  it("changes content identity when policy-relevant content changes", () => {
    const original = status("edited", "<p>original</p>");
    const edited = status("edited", "<p>edited</p>");
    const sensitive = { ...original, sensitive: true };

    expect(buildBookActivityContentIdentity(original))
      .not.toBe(buildBookActivityContentIdentity(edited));
    expect(buildBookActivityContentIdentity(original))
      .not.toBe(buildBookActivityContentIdentity(sensitive));
  });

  it("keeps content identities bounded for oversized text", () => {
    const oversized = status("large", "x".repeat(50_000));
    expect(buildBookActivityContentIdentity(oversized).length).toBeLessThan(256);
  });
});
