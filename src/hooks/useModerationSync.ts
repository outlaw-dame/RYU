import { useEffect, useMemo, useRef, useState } from "react";
import { useModeration } from "./useModeration";
import { useMastodonSession } from "../sync/use-mastodon-activity";
import { buildModerationOwnerIdentity } from "../moderation/owner-identity";
import { enqueueModerationAction } from "../moderation/offline-queue";
import { pullRemoteModerationState, startModerationReplayCoordinator } from "../moderation/sync-service";
import { loadMuteList, saveMuteList } from "../moderation/mute-store";
import { loadBlockList, saveBlockList } from "../moderation/block-store";
import { loadDomainBlockList, normalizeDomain, saveDomainBlockList } from "../moderation/domain-block-store";
import { loadContentFilters, saveContentFilters } from "../moderation/content-filter";
import { setRemoteFilterId } from "../moderation/filter-id-map";
import type { BlockEntry, ContentFilter, DomainBlock, MuteEntry } from "../moderation/types";

export type ModerationSyncStatus = "disconnected" | "hydrating" | "ready";
type MuteSnapshot = { notifications: boolean; durationSeconds?: number };
type FilterSnapshot = { phrase: string; wholeWord: boolean; action: "hide" | "warn" | "blur"; durationSeconds?: number };
type Snapshot = { mutes: Map<string, MuteSnapshot>; blocks: Set<string>; domains: Set<string>; filters: Map<string, FilterSnapshot> };

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | null { return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null; }
function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function secondsUntil(expiresAt?: string | null): number | undefined {
  if (!expiresAt) return undefined;
  const duration = Math.ceil((Date.parse(expiresAt) - Date.now()) / 1_000);
  return Number.isFinite(duration) && duration > 0 ? duration : undefined;
}
function sameJson(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }

function mergeRemoteState(owner: string, state: Awaited<ReturnType<typeof pullRemoteModerationState>>): void {
  const now = new Date().toISOString();
  const mutes = new Map(loadMuteList().map((entry) => [entry.accountId, entry] as const));
  for (const value of state.mutes) {
    const item = record(value); const accountId = text(item?.id); if (!accountId || mutes.has(accountId)) continue;
    const entry: MuteEntry = { accountId, acct: text(item?.acct), createdAt: now, expiresAt: null, hideNotifications: true };
    mutes.set(accountId, entry);
  }
  saveMuteList([...mutes.values()]);

  const blocks = new Map(loadBlockList().map((entry) => [entry.accountId, entry] as const));
  for (const value of state.blocks) {
    const item = record(value); const accountId = text(item?.id); if (!accountId || blocks.has(accountId)) continue;
    const entry: BlockEntry = { accountId, acct: text(item?.acct), createdAt: now };
    blocks.set(accountId, entry);
  }
  saveBlockList([...blocks.values()]);

  const domains = new Map(loadDomainBlockList().map((entry) => [entry.domain, entry] as const));
  for (const value of state.domains) {
    const domain = normalizeDomain(typeof value === "string" ? value : "");
    if (!domain || domains.has(domain)) continue;
    const entry: DomainBlock = { domain, createdAt: now };
    domains.set(domain, entry);
  }
  saveDomainBlockList([...domains.values()]);

  const filters = new Map(loadContentFilters().map((entry) => [entry.id, entry] as const));
  for (const value of state.filters) {
    const item = record(value); const remoteId = text(item?.id); if (!remoteId) continue;
    const keywords = Array.isArray(item?.keywords) ? item.keywords : [];
    const keyword = record(keywords[0]);
    const phrase = text(keyword?.keyword) ?? text(item?.title);
    if (!phrase) continue;
    const localId = `remote:${remoteId}`;
    setRemoteFilterId(owner, localId, remoteId);
    if (filters.has(localId)) continue;
    const remoteAction = text(item?.filter_action);
    const entry: ContentFilter = {
      id: localId,
      phrase,
      wholeWord: keyword?.whole_word === true,
      action: remoteAction === "warn" ? "warn" : "hide",
      createdAt: now,
      expiresAt: text(item?.expires_at) ?? null
    };
    filters.set(localId, entry);
  }
  saveContentFilters([...filters.values()]);
  window.dispatchEvent(new Event("ryu:moderation-sync"));
}

export function useModerationSync(): ModerationSyncStatus {
  const sessionQuery = useMastodonSession();
  const owner = useMemo(() => buildModerationOwnerIdentity(sessionQuery.data), [sessionQuery.data]);
  const moderation = useModeration();
  const previous = useRef<Snapshot | null>(null);
  const [hydratedOwner, setHydratedOwner] = useState<string | null>(null);

  const snapshot = useMemo<Snapshot>(() => ({
    mutes: new Map<string, MuteSnapshot>(moderation.muteList.map((entry) => [entry.accountId, { notifications: entry.hideNotifications ?? true, durationSeconds: secondsUntil(entry.expiresAt) }] as const)),
    blocks: new Set(moderation.blockList.map((entry) => entry.accountId)),
    domains: new Set(moderation.domainBlockList.map((entry) => entry.domain)),
    filters: new Map<string, FilterSnapshot>(moderation.contentFilters.map((entry) => [entry.id, { phrase: entry.phrase, wholeWord: entry.wholeWord, action: entry.action, durationSeconds: secondsUntil(entry.expiresAt) }] as const))
  }), [moderation.blockList, moderation.contentFilters, moderation.domainBlockList, moderation.muteList]);

  useEffect(() => {
    previous.current = null;
    setHydratedOwner(null);
    if (!owner) return;
    let disposed = false;
    let controller: AbortController | null = null;
    const hydrate = () => {
      controller?.abort();
      controller = new AbortController();
      previous.current = null;
      setHydratedOwner(null);
      void pullRemoteModerationState(controller.signal)
        .then((state) => { if (!disposed) mergeRemoteState(owner, state); })
        .catch(() => { /* Local policy remains authoritative while remote is unavailable. */ })
        .finally(() => { if (!disposed) setHydratedOwner(owner); });
    };
    hydrate();
    window.addEventListener("online", hydrate);
    const stopReplay = startModerationReplayCoordinator(owner);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener("online", hydrate);
      stopReplay();
    };
  }, [owner]);

  useEffect(() => {
    if (!owner || hydratedOwner !== owner) { previous.current = null; return; }
    const before = previous.current;
    previous.current = snapshot;
    if (!before) return;

    for (const [accountId, options] of snapshot.mutes) if (!before.mutes.has(accountId) || !sameJson(before.mutes.get(accountId), options)) enqueueModerationAction(owner, "mute", { accountId, ...options });
    for (const accountId of before.mutes.keys()) if (!snapshot.mutes.has(accountId)) enqueueModerationAction(owner, "unmute", { accountId });
    for (const accountId of snapshot.blocks) if (!before.blocks.has(accountId)) enqueueModerationAction(owner, "block", { accountId });
    for (const accountId of before.blocks) if (!snapshot.blocks.has(accountId)) enqueueModerationAction(owner, "unblock", { accountId });
    for (const domain of snapshot.domains) if (!before.domains.has(domain)) enqueueModerationAction(owner, "domain_block", { domain });
    for (const domain of before.domains) if (!snapshot.domains.has(domain)) enqueueModerationAction(owner, "domain_unblock", { domain });
    for (const [filterId, filter] of snapshot.filters) {
      if (!before.filters.has(filterId) || !sameJson(before.filters.get(filterId), filter)) enqueueModerationAction(owner, "filter_create", { filterId, ...filter });
    }
    for (const filterId of before.filters.keys()) if (!snapshot.filters.has(filterId)) enqueueModerationAction(owner, "filter_delete", { filterId });
  }, [hydratedOwner, owner, snapshot]);

  if (!owner) return "disconnected";
  return hydratedOwner === owner ? "ready" : "hydrating";
}
