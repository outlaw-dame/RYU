/**
 * Phase 35 - useModeration hook.
 *
 * Provides moderation actions (mute, block, domain-block, filter) and state.
 * Wraps the moderation stores with React state management so UI updates
 * when moderation lists change.
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
  // Each instance ignores its own notifications to avoid redundant reloads.
  const instanceId = useMemo(() => Math.random().toString(36).slice(2), []);

  useEffect(() => {
    const reload = () => {
      setMuteList(loadMuteList());
      setBlockList(loadBlockList());
      setDomainBlockList(loadDomainBlockList());
      setContentFilters(loadContentFilters());
      setSafeSearchLevelState(loadSafeSearchLevel());
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key?.startsWith("ryu:")) reload();
    };
    const handleSync = (event: Event) => {
      if ((event as CustomEvent).detail !== instanceId) reload();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("ryu:moderation-sync", handleSync);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("ryu:moderation-sync", handleSync);
    };
  }, [instanceId]);

  /** Notify other hook instances in the same tab that moderation state changed. */
  const notifySync = useCallback(() => {
    window.dispatchEvent(new CustomEvent("ryu:moderation-sync", { detail: instanceId }));
  }, [instanceId]);

  const mute = useCallback((accountId: string, options?: { acct?: string; durationMs?: number; hideNotifications?: boolean }) => {
    const updated = addMuteStore(accountId, options);
    setMuteList(updated);
    notifySync();
  }, [notifySync]);

  const unmute = useCallback((accountId: string) => {
    const updated = removeMuteStore(accountId);
    setMuteList(updated);
    notifySync();
  }, [notifySync]);

  const block = useCallback((accountId: string, acct?: string) => {
    const updated = addBlockStore(accountId, acct);
    setBlockList(updated);
    notifySync();
  }, [notifySync]);

  const unblock = useCallback((accountId: string) => {
    const updated = removeBlockStore(accountId);
    setBlockList(updated);
    notifySync();
  }, [notifySync]);

  const blockDomain = useCallback((domain: string, reason?: string) => {
    const updated = addDomainBlockStore(domain, reason);
    setDomainBlockList(updated);
    notifySync();
  }, [notifySync]);

  const unblockDomain = useCallback((domain: string) => {
    const updated = removeDomainBlockStore(domain);
    setDomainBlockList(updated);
    notifySync();
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
