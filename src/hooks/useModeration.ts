/**
 * Phase 35/36 — local moderation state with authenticated RxDB dual-write.
 * Reads remain synchronous from localStorage while all policy mutations are
 * mirrored to the owner/instance-scoped RxDB collection.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ModerationPolicyDoc } from "../db/schema";
import { getDatabase } from "../db/client";
import {
  loadMuteList,
  addMute as addMuteStore,
  removeMute as removeMuteStore
} from "../moderation/mute-store";
import {
  loadBlockList,
  addBlock as addBlockStore,
  removeBlock as removeBlockStore
} from "../moderation/block-store";
import {
  loadDomainBlockList,
  addDomainBlock as addDomainBlockStore,
  removeDomainBlock as removeDomainBlockStore,
  normalizeDomain
} from "../moderation/domain-block-store";
import {
  loadContentFilters,
  addContentFilter as addContentFilterStore,
  removeContentFilter as removeContentFilterStore,
  updateContentFilter as updateContentFilterStore
} from "../moderation/content-filter";
import { loadSafeSearchLevel, saveSafeSearchLevel } from "../moderation/safe-search";
import { evaluateModeration } from "../moderation/moderation-engine";
import type { ModerationInput, ModerationContext } from "../moderation/moderation-engine";
import { buildModerationOwnerIdentity } from "../moderation/owner-identity";
import type {
  MuteEntry,
  BlockEntry,
  DomainBlock,
  ContentFilter,
  ContentFilterAction,
  SafeSearchLevel,
  ModerationResult
} from "../moderation/types";
import { useMastodonSession } from "../sync/use-mastodon-activity";

function dualWritePolicy(doc: ModerationPolicyDoc): void {
  void getDatabase()
    .then((db) => db.moderationpolicies?.upsert(doc))
    .catch(() => console.warn("[useModeration] RxDB dual-write failed"));
}

function dualRemovePolicy(docId: string): void {
  void getDatabase()
    .then(async (db) => {
      if (!db.moderationpolicies) return;
      const existing = await db.moderationpolicies.findOne(docId).exec();
      if (existing) await existing.remove();
    })
    .catch(() => console.warn("[useModeration] RxDB dual-remove failed"));
}

function filterPolicy(owner: string, filter: ContentFilter): ModerationPolicyDoc {
  return {
    id: `local:filter:${owner}:${filter.id}`,
    policyType: "filter",
    ownerAccountId: owner,
    source: "local",
    createdAt: filter.createdAt,
    updatedAt: new Date().toISOString(),
    title: filter.phrase.slice(0, 100),
    keywords: [{ id: `kw-${filter.id}`, keyword: filter.phrase, wholeWord: filter.wholeWord }],
    contexts: ["home", "notifications", "public", "thread", "account"],
    filterAction: filter.action,
    expiresAt: filter.expiresAt ?? undefined
  };
}

export type UseModerationResult = {
  muteList: MuteEntry[];
  blockList: BlockEntry[];
  domainBlockList: DomainBlock[];
  contentFilters: ContentFilter[];
  safeSearchLevel: SafeSearchLevel;
  mute: (accountId: string, options?: { acct?: string; durationMs?: number; hideNotifications?: boolean }) => void;
  unmute: (accountId: string) => void;
  block: (accountId: string, acct?: string) => void;
  unblock: (accountId: string) => void;
  blockDomain: (domain: string, reason?: string) => void;
  unblockDomain: (domain: string) => void;
  addFilter: (phrase: string, options?: { wholeWord?: boolean; action?: ContentFilterAction; durationMs?: number }) => void;
  removeFilter: (filterId: string) => void;
  updateFilter: (filterId: string, updates: Partial<Pick<ContentFilter, "phrase" | "wholeWord" | "action" | "expiresAt">>) => void;
  setSafeSearchLevel: (level: SafeSearchLevel) => void;
  evaluate: (input: ModerationInput, context?: ModerationContext) => ModerationResult;
};

export function useModeration(): UseModerationResult {
  const sessionQuery = useMastodonSession();
  const owner = useMemo(
    () => buildModerationOwnerIdentity(sessionQuery.data),
    [sessionQuery.data]
  );

  const [muteList, setMuteList] = useState<MuteEntry[]>(() => loadMuteList());
  const [blockList, setBlockList] = useState<BlockEntry[]>(() => loadBlockList());
  const [domainBlockList, setDomainBlockList] = useState<DomainBlock[]>(() => loadDomainBlockList());
  const [contentFilters, setContentFilters] = useState<ContentFilter[]>(() => loadContentFilters());
  const [safeSearchLevel, setSafeSearchLevelState] = useState<SafeSearchLevel>(() => loadSafeSearchLevel());

  useEffect(() => {
    const reload = () => {
      setMuteList(loadMuteList());
      setBlockList(loadBlockList());
      setDomainBlockList(loadDomainBlockList());
      setContentFilters(loadContentFilters());
      setSafeSearchLevelState(loadSafeSearchLevel());
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith("ryu:")) reload();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("ryu:moderation-sync", reload);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("ryu:moderation-sync", reload);
    };
  }, []);

  const notifySync = useCallback(() => {
    window.dispatchEvent(new Event("ryu:moderation-sync"));
  }, []);

  const mute = useCallback((accountId: string, options?: { acct?: string; durationMs?: number; hideNotifications?: boolean }) => {
    const normalizedAccountId = accountId.trim();
    const updated = addMuteStore(normalizedAccountId, options);
    setMuteList(updated);
    notifySync();
    if (!owner || !normalizedAccountId) return;
    const now = new Date().toISOString();
    dualWritePolicy({
      id: `local:mute:${owner}:${normalizedAccountId}`,
      policyType: "account_mute",
      ownerAccountId: owner,
      source: "local",
      createdAt: now,
      updatedAt: now,
      accountId: normalizedAccountId,
      acct: options?.acct,
      hideNotifications: options?.hideNotifications ?? true,
      expiresAt: options?.durationMs ? new Date(Date.now() + options.durationMs).toISOString() : undefined
    });
  }, [notifySync, owner]);

  const unmute = useCallback((accountId: string) => {
    const normalizedAccountId = accountId.trim();
    setMuteList(removeMuteStore(normalizedAccountId));
    notifySync();
    if (owner && normalizedAccountId) dualRemovePolicy(`local:mute:${owner}:${normalizedAccountId}`);
  }, [notifySync, owner]);

  const block = useCallback((accountId: string, acct?: string) => {
    const normalizedAccountId = accountId.trim();
    setBlockList(addBlockStore(normalizedAccountId, acct));
    notifySync();
    if (!owner || !normalizedAccountId) return;
    const now = new Date().toISOString();
    dualWritePolicy({
      id: `local:block:${owner}:${normalizedAccountId}`,
      policyType: "account_block",
      ownerAccountId: owner,
      source: "local",
      createdAt: now,
      updatedAt: now,
      accountId: normalizedAccountId,
      acct,
      hideNotifications: true
    });
  }, [notifySync, owner]);

  const unblock = useCallback((accountId: string) => {
    const normalizedAccountId = accountId.trim();
    setBlockList(removeBlockStore(normalizedAccountId));
    notifySync();
    if (owner && normalizedAccountId) dualRemovePolicy(`local:block:${owner}:${normalizedAccountId}`);
  }, [notifySync, owner]);

  const blockDomain = useCallback((domain: string, reason?: string) => {
    const normalizedDomain = normalizeDomain(domain);
    setDomainBlockList(addDomainBlockStore(normalizedDomain, reason));
    notifySync();
    if (!owner || !normalizedDomain) return;
    const now = new Date().toISOString();
    dualWritePolicy({
      id: `local:domain:${owner}:${normalizedDomain}`,
      policyType: "domain_block",
      ownerAccountId: owner,
      source: "local",
      createdAt: now,
      updatedAt: now,
      domain: normalizedDomain,
      severity: "block",
      reason
    });
  }, [notifySync, owner]);

  const unblockDomain = useCallback((domain: string) => {
    const normalizedDomain = normalizeDomain(domain);
    setDomainBlockList(removeDomainBlockStore(normalizedDomain));
    notifySync();
    if (owner && normalizedDomain) dualRemovePolicy(`local:domain:${owner}:${normalizedDomain}`);
  }, [notifySync, owner]);

  const addFilter = useCallback((phrase: string, options?: { wholeWord?: boolean; action?: ContentFilterAction; durationMs?: number }) => {
    const before = new Set(loadContentFilters().map((filter) => filter.id));
    const updated = addContentFilterStore(phrase, options);
    setContentFilters(updated);
    notifySync();
    if (!owner) return;
    const added = updated.find((filter) => !before.has(filter.id));
    if (added) dualWritePolicy(filterPolicy(owner, added));
  }, [notifySync, owner]);

  const removeFilter = useCallback((filterId: string) => {
    setContentFilters(removeContentFilterStore(filterId));
    notifySync();
    if (owner && filterId) dualRemovePolicy(`local:filter:${owner}:${filterId}`);
  }, [notifySync, owner]);

  const updateFilter = useCallback((filterId: string, updates: Partial<Pick<ContentFilter, "phrase" | "wholeWord" | "action" | "expiresAt">>) => {
    const updated = updateContentFilterStore(filterId, updates);
    setContentFilters(updated);
    notifySync();
    if (!owner) return;
    const filter = updated.find((candidate) => candidate.id === filterId);
    if (filter) dualWritePolicy(filterPolicy(owner, filter));
  }, [notifySync, owner]);

  const setSafeSearchLevel = useCallback((level: SafeSearchLevel) => {
    saveSafeSearchLevel(level);
    setSafeSearchLevelState(level);
    notifySync();
  }, [notifySync]);

  const evaluate = useCallback((input: ModerationInput, context?: ModerationContext) => (
    evaluateModeration(input, context)
  ), []);

  return useMemo(() => ({
    muteList,
    blockList,
    domainBlockList,
    contentFilters,
    safeSearchLevel,
    mute,
    unmute,
    block,
    unblock,
    blockDomain,
    unblockDomain,
    addFilter,
    removeFilter,
    updateFilter,
    setSafeSearchLevel,
    evaluate
  }), [
    muteList,
    blockList,
    domainBlockList,
    contentFilters,
    safeSearchLevel,
    mute,
    unmute,
    block,
    unblock,
    blockDomain,
    unblockDomain,
    addFilter,
    removeFilter,
    updateFilter,
    setSafeSearchLevel,
    evaluate
  ]);
}
