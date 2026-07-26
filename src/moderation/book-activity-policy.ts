import type { MastodonStatus } from "../sync/mastodon-client";
import type { PolicyDecision } from "./policy-types";
import type { PolicySurfaceResult } from "./policy-surface-adapter";

export type BookActivityPolicyProjection = {
  visibleStatuses: MastodonStatus[];
  decisionByStatus: ReadonlyMap<MastodonStatus, PolicyDecision>;
};

/**
 * Projects canonical policy results into the inputs required by the book
 * activity classifier. Hard-hidden statuses are removed before they can affect
 * grouping, counts, or labels; intervention decisions remain attached to the
 * exact status object rendered by the feed.
 */
export function projectBookActivityPolicy(
  results: readonly PolicySurfaceResult<MastodonStatus>[]
): BookActivityPolicyProjection {
  const visibleStatuses: MastodonStatus[] = [];
  const decisionByStatus = new Map<MastodonStatus, PolicyDecision>();

  for (const result of results) {
    if (result.hidden || result.decision.action === "hide") continue;
    visibleStatuses.push(result.item);
    decisionByStatus.set(result.item, result.decision);
  }

  return {
    visibleStatuses,
    decisionByStatus
  };
}

/**
 * Produces a bounded identity for reveal-state invalidation. The status ID is
 * insufficient because edits and policy-relevant metadata may change while the
 * federated ID remains stable.
 */
export function buildBookActivityContentIdentity(status: MastodonStatus): string {
  const accountId = status.account?.id ?? "";
  const createdAt = status.created_at ?? "";
  const content = status.content ?? "";
  const spoiler = status.spoiler_text ?? "";
  const sensitive = status.sensitive === true ? "1" : "0";

  return `${status.id}\u001f${accountId}\u001f${createdAt}\u001f${sensitive}\u001f${hashText(content)}\u001f${hashText(spoiler)}`;
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
