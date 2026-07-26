/**
 * Phase 35/36 - useModeration hook.
 *
 * Provides moderation actions (mute, block, domain-block, filter) and state.
 * Wraps the moderation stores with React state management so UI updates
 * when moderation lists change.
 *
 * Dual-write strategy: all mutations write to localStorage (synchronous,
 * always available) AND asynchronously to RxDB (durable, cross-tab via
 * multi-instance). Reads remain from localStorage for now (synchronous).
 */

import { useCallback, useEffect, useState, useMemo } from "react";
import type {
  MuteEntry,
  BlockEntry,
  DomainBlock,
  ContentFilter,
  SafeSearchLevel,
  ModerationResult
} from "../moderation/types";
import type { ModerationInput, ModerationContext } from "../moderation/moderation-engine";
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
  removeDomainBlock as removeDomainBlockStore
} from "../moderation/domain-block-store";
import {
  loadContentFilters,
  addContentFilter as addContentFilterStore,
  removeContentFilter as removeContentFilterStore,
  updateContentFilter as updateContentFilterStore
} from "../moderation/content-filter";
import {
  loadSafeSearchLevel,
  saveSafeSearchLevel
} from "../moderation/safe-search";
import { evaluateModeration } from "../moderation/moderation-engine";
import type { ContentFilterAction } from "../moderation/types";
import type { ModerationPolicyDoc } from "../db/schema";
import { getDatabase } from "../db/client";

// ─── RxDB Dual-Write (fire-and-forget) ────────────────────────────────────────

/**
 * Asynchronously upsert a moderation policy to RxDB.
 * Never throws — failures are logged but don't affect the UI.
 */
function dualWritePolicy(doc: ModerationPolicyDoc): void {
  getDatabase()
    .then((db) => {
      if (!db.moderationpolicies) return;
      return db.moderationpolicies.upsert(doc);
    })
    .catch((err) => {
      console.warn("[useModeration] RxDB dual-write failed:", err);
    });
}

/**
 * Asynchronously remove a moderation policy from RxDB by ID.
 */
function dualRemovePolicy(docId: string): void {
  getDatabase()
    .then(async (db) => {
      if (!db.moderationpolicies) return;
      const existing = await db.moderationpolicies.findOne(docId).exec();
      if (existing) await existing.remove();
    })
    .catch((err) => {
      console.warn("[useModeration] RxDB dual-remove failed:", err);
    });
}

/**
 * Get the current owner account ID from localStorage session state.
 * Returns empty string if not available (pre-login).
 */
function getCurrentOwnerAccountId(): string {
  if (typeof localStorage === "undefined") return "";
  try {
    const raw = localStorage.getItem("ryu:session");
    if (!raw) return "";
    const session = JSON.parse(raw);
    return session?.account?.acct ?? "";
  } catch {
    return "";
  }
}

export type UseModerationResult = {
  /** Current mute list. */
  muteList: MuteEntry[];
  /** Current block list. */
  blockList: BlockEntry[];
  /** Current domain block list. */
  domainBlockList: DomainBlock[];
  /** Current content filters. */
  contentFilters: ContentFilter[];
  /** Current safe search level. */
  safeSearchLevel: SafeSearchLevel;

  /** Mute an account. */
  mute: (accountId: string, options?: { acct?: string; durationMs?: number; hideNotifications?: boolean }) => void;
  /** Unmute an account. */
  unmute: (accountId: string) => void;
  /** Block an account. */
  block: (accountId: string, acct?: string) => void;
  /** Unblock an account. */
  unblock: (accountId: string) => void;
  /** Block a domain. */
  blockDomain: (domain: string, reason?: string) => void;
  /** Unblock a domain. */
  unblockDomain: (domain: string) => void;
  /** Add a content filter. */
  addFilter: (phrase: string, options?: { wholeWord?: boolean; action?: ContentFilterAction; durationMs?: number }) => void;
  /** Remove a content filter. */
  removeFilter: (filterId: string) => void;
  /** Update a content filter. */
  updateFilter: (filterId: string, updates: Partial<Pick<ContentFilter, "phrase" | "wholeWord" | "action" | "expiresAt">>) => void;
  /** Set safe search level. */
  setSafeSearchLevel: (level: SafeSearchLevel) => void;

  /** Evaluate moderation for a piece of content. */
  evaluate: (input: ModerationInput, context?: ModerationContext) => ModerationResult;
};

/**
 * Hook providing moderation actions and state.
 *
 * Usage:
 * ```tsx
 * const { mute, block, blockDomain, addFilter, evaluate } = useModeration();
 * const result = evaluate({ accountId: status.account.id, acct: status.account.acct, content: status.content });
 * ```
 */
export function useModeration(): UseModerationResult {
  const [muteList, setMuteList] = useState<MuteEntry[]>(() => loadMuteList());
  const [blockList, setBlockList] = useState<BlockEntry[]>(() => loadBlockList());
  const [domainBlockList, setDomainBlockList] = useState<DomainBlock[]>(() => loadDomainBlockList());
  const [contentFilters, setContentFilters] = useState<ContentFilter[]>(() => loadContentFilters());
  const [safeSearchLevel, setSafeSearchLevelState] = useState<SafeSearchLevel>(() => loadSafeSearchLevel());

  // Cross-instance / cross-tab sync via storage events + same-tab sync
  // via custom event. The storage event only fires in OTHER tabs; the
  // custom event ensures all hook instances in the current tab stay in sync.
  useEffect(() => {
    const reload = () => {
      setMuteList(loadMuteList());
      setBlockList(loadBlockList());
      setDomainBlockList(loadDomainBlockList());
      setContentFilters(loadContentFilters());
      setSafeSearchLevelState(loadSafeSearchLevel());
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key?.startsWith("ryu:")) reload();
    };
    const handleSync = () => reload();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("ryu:moderation-sync", handleSync);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("ryu:moderation-sync", handleSync);
    };
  }, []);

  /** Notify other hook instances in the same tab that moderation state changed. */
  const notifySync = useCallback(() => {
    window.dispatchEvent(new Event("ryu:moderation-sync"));
  }, []);

  const mute = useCallback((accountId: string, options?: { acct?: string; durationMs?: number; hideNotifications?: boolean }) => {
    const updated = addMuteStore(accountId, options);
    setMuteList(updated);
    notifySync();
    const owner = getCurrentOwnerAccountId();
    if (owner) {
      const now = new Date().toISOString();
      dualWritePolicy({
        id: `local:mute:${owner}:${accountId}`,
        policyType: "account_mute",
        ownerAccountId: owner,
        source: "local",
        createdAt: now,
        updatedAt: now,
        accountId,
        acct: options?.acct,
        hideNotifications: options?.hideNotifications ?? true,
        expiresAt: options?.durationMs ? new Date(Date.now() + options.durationMs).toISOString() : undefined
      });
    }
  }, [notifySync]);

  const unmute = useCallback((accountId: string) => {
    const updated = removeMuteStore(accountId);
    setMuteList(updated);
    notifySync();
    const owner = getCurrentOwnerAccountId();
    if (owner) dualRemovePolicy(`local:mute:${owner}:${accountId}`);
  }, [notifySync]);

  const block = useCallback((accountId: string, acct?: string) => {
    const updated = addBlockStore(accountId, acct);
    setBlockList(updated);
    notifySync();
    const owner = getCurrentOwnerAccountId();
    if (owner) {
      const now = new Date().toISOString();
      dualWritePolicy({
        id: `local:block:${owner}:${accountId}`,
        policyType: "account_block",
        ownerAccountId: owner,
        source: "local",
        createdAt: now,
        updatedAt: now,
        accountId,
        acct,
        hideNotifications: true
      });
    }
  }, [notifySync]);

  const unblock = useCallback((accountId: string) => {
    const updated = removeBlockStore(accountId);
    setBlockList(updated);
    notifySync();
    const owner = getCurrentOwnerAccountId();
    if (owner) dualRemovePolicy(`local:block:${owner}:${accountId}`);
  }, [notifySync]);

  const blockDomain = useCallback((domain: string, reason?: string) => {
    const updated = addDomainBlockStore(domain, reason);
    setDomainBlockList(updated);
    notifySync();
    const owner = getCurrentOwnerAccountId();
    if (owner) {
      const now = new Date().toISOString();
      dualWritePolicy({
        id: `local:domain:${owner}:${domain}`,
        policyType: "domain_block",
        ownerAccountId: owner,
        source: "local",
        createdAt: now,
        updatedAt: now,
        domain,
        severity: "block",
        reason
      });
    }
  }, [notifySync]);

  const unblockDomain = useCallback((domain: string) => {
    const updated = removeDomainBlockStore(domain);
    setDomainBlockList(updated);
    notifySync();
    const owner = getCurrentOwnerAccountId();
    if (owner) dualRemovePolicy(`local:domain:${owner}:${domain}`);
  }, [notifySync]);

  const addFilter = useCallback((phrase: string, options?: { wholeWord?: boolean; action?: ContentFilterAction; durationMs?: number }) => {
    const updated = addContentFilterStore(phrase, options);
    setContentFilters(updated);
    notifySync();
  }, [notifySync]);

  const removeFilter = useCallback((filterId: string) => {
    const updated = removeContentFilterStore(filterId);
    setContentFilters(updated);
    notifySync();
  }, [notifySync]);

  const updateFilter = useCallback((filterId: string, updates: Partial<Pick<ContentFilter, "phrase" | "wholeWord" | "action" | "expiresAt">>) => {
    const updated = updateContentFilterStore(filterId, updates);
    setContentFilters(updated);
    notifySync();
  }, [notifySync]);

  const setSafeSearchLevel = useCallback((level: SafeSearchLevel) => {
    saveSafeSearchLevel(level);
    setSafeSearchLevelState(level);
    notifySync();
  }, [notifySync]);

  const evaluate = useCallback((input: ModerationInput, context?: ModerationContext): ModerationResult => {
    return evaluateModeration(input, context);
  }, []);

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
    muteList, blockList, domainBlockList, contentFilters, safeSearchLevel,
    mute, unmute, block, unblock, blockDomain, unblockDomain,
    addFilter, removeFilter, updateFilter, setSafeSearchLevel, evaluate
  ]);
}
