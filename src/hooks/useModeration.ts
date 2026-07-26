/**
 * Phase 35-37 — local-first moderation with owner-scoped RxDB dual-write and
 * authenticated remote synchronization. Local policy always applies first.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ModerationPolicyDoc } from "../db/schema";
import { getDatabase } from "../db/client";
import { loadMuteList, addMute as addMuteStore, removeMute as removeMuteStore } from "../moderation/mute-store";
import { loadBlockList, addBlock as addBlockStore, removeBlock as removeBlockStore } from "../moderation/block-store";
import { loadDomainBlockList, addDomainBlock as addDomainBlockStore, removeDomainBlock as removeDomainBlockStore, normalizeDomain } from "../moderation/domain-block-store";
import { loadContentFilters, addContentFilter as addContentFilterStore, removeContentFilter as removeContentFilterStore, updateContentFilter as updateContentFilterStore } from "../moderation/content-filter";
import { loadSafeSearchLevel, saveSafeSearchLevel } from "../moderation/safe-search";
import { evaluateModeration } from "../moderation/moderation-engine";
import type { ModerationInput, ModerationContext } from "../moderation/moderation-engine";
import { buildModerationOwnerIdentity } from "../moderation/owner-identity";
import { clearModerationQueue } from "../moderation/sync-queue";
import { runModerationSync, scheduleModerationAction } from "../moderation/sync-runtime";
import type { MuteEntry, BlockEntry, DomainBlock, ContentFilter, ContentFilterAction, SafeSearchLevel, ModerationResult } from "../moderation/types";
import { useMastodonSession } from "../sync/use-mastodon-activity";

function dualWritePolicy(doc: ModerationPolicyDoc): void {
  void getDatabase().then((db) => db.moderationpolicies?.upsert(doc)).catch(() => console.warn("[useModeration] RxDB dual-write failed"));
}
function dualRemovePolicy(docId: string): void {
  void getDatabase().then(async (db) => {
    if (!db.moderationpolicies) return;
    const existing = await db.moderationpolicies.findOne(docId).exec();
    if (existing) await existing.remove();
  }).catch(() => console.warn("[useModeration] RxDB dual-remove failed"));
}
function filterPolicy(owner: string, filter: ContentFilter): ModerationPolicyDoc {
  return {
    id: `local:filter:${owner}:${filter.id}`, policyType: "filter", ownerAccountId: owner,
    source: "local", createdAt: filter.createdAt, updatedAt: new Date().toISOString(),
    title: filter.phrase.slice(0, 100), keywords: [{ id: `kw-${filter.id}`, keyword: filter.phrase, wholeWord: filter.wholeWord }],
    contexts: ["home", "notifications", "public", "thread", "account"], filterAction: filter.action,
    expiresAt: filter.expiresAt ?? undefined
  };
}
function remoteFilterAction(action: ContentFilterAction): "warn" | "hide" { return action === "hide" ? "hide" : "warn"; }

export type UseModerationResult = {
  muteList: MuteEntry[]; blockList: BlockEntry[]; domainBlockList: DomainBlock[]; contentFilters: ContentFilter[];
  safeSearchLevel: SafeSearchLevel;
  mute: (accountId: string, options?: { acct?: string; durationMs?: number; hideNotifications?: boolean }) => void;
  unmute: (accountId: string) => void; block: (accountId: string, acct?: string) => void; unblock: (accountId: string) => void;
  blockDomain: (domain: string, reason?: string) => void; unblockDomain: (domain: string) => void;
  addFilter: (phrase: string, options?: { wholeWord?: boolean; action?: ContentFilterAction; durationMs?: number }) => void;
  removeFilter: (filterId: string) => void;
  updateFilter: (filterId: string, updates: Partial<Pick<ContentFilter, "phrase" | "wholeWord" | "action" | "expiresAt">>) => void;
  setSafeSearchLevel: (level: SafeSearchLevel) => void;
  evaluate: (input: ModerationInput, context?: ModerationContext) => ModerationResult;
};

export function useModeration(): UseModerationResult {
  const sessionQuery = useMastodonSession();
  const owner = useMemo(() => buildModerationOwnerIdentity(sessionQuery.data), [sessionQuery.data]);
  const previousOwner = useRef<string | null>(null);
  const [muteList, setMuteList] = useState<MuteEntry[]>(() => loadMuteList());
  const [blockList, setBlockList] = useState<BlockEntry[]>(() => loadBlockList());
  const [domainBlockList, setDomainBlockList] = useState<DomainBlock[]>(() => loadDomainBlockList());
  const [contentFilters, setContentFilters] = useState<ContentFilter[]>(() => loadContentFilters());
  const [safeSearchLevel, setSafeSearchLevelState] = useState<SafeSearchLevel>(() => loadSafeSearchLevel());

  const reload = useCallback(() => {
    setMuteList(loadMuteList()); setBlockList(loadBlockList()); setDomainBlockList(loadDomainBlockList());
    setContentFilters(loadContentFilters()); setSafeSearchLevelState(loadSafeSearchLevel());
  }, []);
  const notifySync = useCallback(() => { window.dispatchEvent(new Event("ryu:moderation-sync")); }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => { if (event.key === null || event.key.startsWith("ryu:")) reload(); };
    window.addEventListener("storage", handleStorage); window.addEventListener("ryu:moderation-sync", reload);
    return () => { window.removeEventListener("storage", handleStorage); window.removeEventListener("ryu:moderation-sync", reload); };
  }, [reload]);

  useEffect(() => {
    const prior = previousOwner.current;
    if (prior && prior !== owner) clearModerationQueue(prior);
    previousOwner.current = owner;
    if (!owner) return;
    const sync = () => { void runModerationSync(owner, notifySync).catch(() => undefined); };
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [notifySync, owner]);

  const mute = useCallback((accountId: string, options?: { acct?: string; durationMs?: number; hideNotifications?: boolean }) => {
    const id = accountId.trim(); const updated = addMuteStore(id, options); setMuteList(updated); notifySync();
    if (!owner || !id) return;
    const now = new Date().toISOString();
    dualWritePolicy({ id: `local:mute:${owner}:${id}`, policyType: "account_mute", ownerAccountId: owner, source: "local", createdAt: now, updatedAt: now, accountId: id, acct: options?.acct, hideNotifications: options?.hideNotifications ?? true, expiresAt: options?.durationMs ? new Date(Date.now() + options.durationMs).toISOString() : undefined });
    scheduleModerationAction(owner, { kind: "mute", accountId: id, notifications: options?.hideNotifications ?? true, duration: options?.durationMs ? Math.ceil(options.durationMs / 1000) : undefined });
  }, [notifySync, owner]);

  const unmute = useCallback((accountId: string) => {
    const id = accountId.trim(); setMuteList(removeMuteStore(id)); notifySync();
    if (owner && id) { dualRemovePolicy(`local:mute:${owner}:${id}`); scheduleModerationAction(owner, { kind: "unmute", accountId: id }); }
  }, [notifySync, owner]);

  const block = useCallback((accountId: string, acct?: string) => {
    const id = accountId.trim(); setBlockList(addBlockStore(id, acct)); notifySync();
    if (!owner || !id) return;
    const now = new Date().toISOString();
    dualWritePolicy({ id: `local:block:${owner}:${id}`, policyType: "account_block", ownerAccountId: owner, source: "local", createdAt: now, updatedAt: now, accountId: id, acct, hideNotifications: true });
    scheduleModerationAction(owner, { kind: "block", accountId: id });
  }, [notifySync, owner]);

  const unblock = useCallback((accountId: string) => {
    const id = accountId.trim(); setBlockList(removeBlockStore(id)); notifySync();
    if (owner && id) { dualRemovePolicy(`local:block:${owner}:${id}`); scheduleModerationAction(owner, { kind: "unblock", accountId: id }); }
  }, [notifySync, owner]);

  const blockDomain = useCallback((domain: string, reason?: string) => {
    const normalized = normalizeDomain(domain); setDomainBlockList(addDomainBlockStore(normalized, reason)); notifySync();
    if (!owner || !normalized) return;
    const now = new Date().toISOString();
    dualWritePolicy({ id: `local:domain:${owner}:${normalized}`, policyType: "domain_block", ownerAccountId: owner, source: "local", createdAt: now, updatedAt: now, domain: normalized, severity: "block", reason });
    scheduleModerationAction(owner, { kind: "domain_block", domain: normalized });
  }, [notifySync, owner]);

  const unblockDomain = useCallback((domain: string) => {
    const normalized = normalizeDomain(domain); setDomainBlockList(removeDomainBlockStore(normalized)); notifySync();
    if (owner && normalized) { dualRemovePolicy(`local:domain:${owner}:${normalized}`); scheduleModerationAction(owner, { kind: "domain_unblock", domain: normalized }); }
  }, [notifySync, owner]);

  const addFilter = useCallback((phrase: string, options?: { wholeWord?: boolean; action?: ContentFilterAction; durationMs?: number }) => {
    const before = new Set(loadContentFilters().map((filter) => filter.id)); const updated = addContentFilterStore(phrase, options); setContentFilters(updated); notifySync();
    const added = updated.find((filter) => !before.has(filter.id));
    if (owner && added) {
      dualWritePolicy(filterPolicy(owner, added));
      scheduleModerationAction(owner, { kind: "filter_create", title: added.phrase.slice(0, 200), context: ["home", "notifications", "public", "thread", "account"], filterAction: remoteFilterAction(added.action), keyword: added.phrase, wholeWord: added.wholeWord, expiresIn: options?.durationMs ? Math.ceil(options.durationMs / 1000) : undefined });
    }
  }, [notifySync, owner]);

  const removeFilter = useCallback((filterId: string) => {
    const existing = loadContentFilters().find((filter) => filter.id === filterId); setContentFilters(removeContentFilterStore(filterId)); notifySync();
    if (owner && filterId) dualRemovePolicy(`local:filter:${owner}:${filterId}`);
    if (owner && existing) scheduleModerationAction(owner, { kind: "filter_delete", filterId: existing.id, keyword: existing.phrase, wholeWord: existing.wholeWord, filterAction: remoteFilterAction(existing.action) });
  }, [notifySync, owner]);

  const updateFilter = useCallback((filterId: string, updates: Partial<Pick<ContentFilter, "phrase" | "wholeWord" | "action" | "expiresAt">>) => {
    const previous = loadContentFilters().find((filter) => filter.id === filterId); const updated = updateContentFilterStore(filterId, updates); setContentFilters(updated); notifySync();
    const filter = updated.find((candidate) => candidate.id === filterId);
    if (owner && filter) {
      dualWritePolicy(filterPolicy(owner, filter));
      if (previous) scheduleModerationAction(owner, { kind: "filter_delete", filterId: previous.id, keyword: previous.phrase, wholeWord: previous.wholeWord, filterAction: remoteFilterAction(previous.action) });
      scheduleModerationAction(owner, { kind: "filter_create", title: filter.phrase.slice(0, 200), context: ["home", "notifications", "public", "thread", "account"], filterAction: remoteFilterAction(filter.action), keyword: filter.phrase, wholeWord: filter.wholeWord });
    }
  }, [notifySync, owner]);

  const setSafeSearchLevel = useCallback((level: SafeSearchLevel) => { saveSafeSearchLevel(level); setSafeSearchLevelState(level); notifySync(); }, [notifySync]);
  const evaluate = useCallback((input: ModerationInput, context?: ModerationContext) => evaluateModeration(input, context), []);

  return useMemo(() => ({ muteList, blockList, domainBlockList, contentFilters, safeSearchLevel, mute, unmute, block, unblock, blockDomain, unblockDomain, addFilter, removeFilter, updateFilter, setSafeSearchLevel, evaluate }), [muteList, blockList, domainBlockList, contentFilters, safeSearchLevel, mute, unmute, block, unblock, blockDomain, unblockDomain, addFilter, removeFilter, updateFilter, setSafeSearchLevel, evaluate]);
}
