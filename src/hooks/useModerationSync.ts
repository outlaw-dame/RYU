import { useEffect, useMemo, useRef } from "react";
import { useModeration } from "./useModeration";
import { useMastodonSession } from "../sync/use-mastodon-activity";
import { buildModerationOwnerIdentity } from "../moderation/owner-identity";
import { enqueueModerationAction } from "../moderation/offline-queue";
import { startModerationReplayCoordinator } from "../moderation/sync-service";

export type ModerationSyncStatus = "disconnected" | "ready";

type Snapshot = {
  mutes: Map<string, { notifications: boolean; durationSeconds?: number }>;
  blocks: Set<string>;
  domains: Set<string>;
  filters: Map<string, { phrase: string; wholeWord: boolean; action: "hide" | "warn" | "blur"; durationSeconds?: number }>;
};

function secondsUntil(expiresAt?: string): number | undefined {
  if (!expiresAt) return undefined;
  const duration = Math.ceil((Date.parse(expiresAt) - Date.now()) / 1_000);
  return Number.isFinite(duration) && duration > 0 ? duration : undefined;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useModerationSync(): ModerationSyncStatus {
  const sessionQuery = useMastodonSession();
  const owner = useMemo(() => buildModerationOwnerIdentity(sessionQuery.data), [sessionQuery.data]);
  const moderation = useModeration();
  const previous = useRef<Snapshot | null>(null);

  const snapshot = useMemo<Snapshot>(() => ({
    mutes: new Map(moderation.muteList.map((entry) => [entry.accountId, {
      notifications: entry.hideNotifications ?? true,
      durationSeconds: secondsUntil(entry.expiresAt)
    }])),
    blocks: new Set(moderation.blockList.map((entry) => entry.accountId)),
    domains: new Set(moderation.domainBlockList.map((entry) => entry.domain)),
    filters: new Map(moderation.contentFilters.map((entry) => [entry.id, {
      phrase: entry.phrase,
      wholeWord: entry.wholeWord,
      action: entry.action,
      durationSeconds: secondsUntil(entry.expiresAt)
    }]))
  }), [moderation.blockList, moderation.contentFilters, moderation.domainBlockList, moderation.muteList]);

  useEffect(() => {
    previous.current = null;
    if (!owner) return;
    return startModerationReplayCoordinator(owner);
  }, [owner]);

  useEffect(() => {
    if (!owner) {
      previous.current = null;
      return;
    }
    const before = previous.current;
    previous.current = snapshot;
    if (!before) return;

    for (const [accountId, options] of snapshot.mutes) {
      if (!before.mutes.has(accountId) || !sameJson(before.mutes.get(accountId), options)) {
        enqueueModerationAction(owner, "mute", { accountId, ...options });
      }
    }
    for (const accountId of before.mutes.keys()) {
      if (!snapshot.mutes.has(accountId)) enqueueModerationAction(owner, "unmute", { accountId });
    }

    for (const accountId of snapshot.blocks) {
      if (!before.blocks.has(accountId)) enqueueModerationAction(owner, "block", { accountId });
    }
    for (const accountId of before.blocks) {
      if (!snapshot.blocks.has(accountId)) enqueueModerationAction(owner, "unblock", { accountId });
    }

    for (const domain of snapshot.domains) {
      if (!before.domains.has(domain)) enqueueModerationAction(owner, "domain_block", { domain });
    }
    for (const domain of before.domains) {
      if (!snapshot.domains.has(domain)) enqueueModerationAction(owner, "domain_unblock", { domain });
    }

    for (const [filterId, filter] of snapshot.filters) {
      if (!before.filters.has(filterId) || !sameJson(before.filters.get(filterId), filter)) {
        if (before.filters.has(filterId)) enqueueModerationAction(owner, "filter_delete", { filterId });
        enqueueModerationAction(owner, "filter_create", filter);
      }
    }
    for (const filterId of before.filters.keys()) {
      if (!snapshot.filters.has(filterId)) enqueueModerationAction(owner, "filter_delete", { filterId });
    }
  }, [owner, snapshot]);

  return owner ? "ready" : "disconnected";
}
