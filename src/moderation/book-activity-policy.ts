import type { MastodonStatus } from "../sync/mastodon-client";
import type { PolicyDecision } from "./policy-types";
import type { PolicySurfaceResult } from "./policy-surface-adapter";

export type BookActivityPolicyProjection = {
  /** Fully visible statuses allowed to contribute to groups, labels, and counts. */
  showStatuses: MastodonStatus[];
  /** Non-hidden statuses that require explicit reveal and must remain ungrouped. */
  interventionStatuses: MastodonStatus[];
  decisionByStatus: ReadonlyMap<MastodonStatus, PolicyDecision>;
};

/**
 * Projects canonical policy results into the inputs required by the book
 * activity classifier. Only `show` statuses may contribute to shared metadata.
 * Intervention-required statuses remain renderable, but are isolated so their
 * quoted titles, hashtags, authors, and classifications cannot leak through a
 * group header or count before explicit reveal.
 */
export function projectBookActivityPolicy(
  results: readonly PolicySurfaceResult<MastodonStatus>[]
): BookActivityPolicyProjection {
  const showStatuses: MastodonStatus[] = [];
  const interventionStatuses: MastodonStatus[] = [];
  const decisionByStatus = new Map<MastodonStatus, PolicyDecision>();

  for (const result of results) {
    if (result.hidden || result.decision.action === "hide") continue;

    decisionByStatus.set(result.item, result.decision);
    if (result.decision.action === "show") showStatuses.push(result.item);
    else interventionStatuses.push(result.item);
  }

  return {
    showStatuses,
    interventionStatuses,
    decisionByStatus
  };
}

/**
 * React reconciliation key scoped by actor and creation time instead of the
 * server-local status ID alone. This prevents cross-instance or malformed-feed
 * collisions from reusing moderation gate state for another item.
 */
export function buildBookActivityRenderKey(status: MastodonStatus): string {
  return `${status.account?.id ?? ""}\u001f${status.id}\u001f${status.created_at ?? ""}`;
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
