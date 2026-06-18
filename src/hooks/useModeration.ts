/**
 * Phase 35 - useModeration hook.
 *
 * Provides moderation actions (mute, block, domain-block, filter) and state.
 * Wraps the moderation stores with React state management so UI updates
 * when moderation lists change.
 *
 * When `connected` is true, mute/block/unblock actions are also pushed to the
 * server. If the push fails (offline), the action is queued for later sync.
 */

import { useCallback, useState, useMemo } from "react";
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
import { enqueueAction } from "../moderation/moderation-sync";
import {
  serverMuteAccount,
  serverUnmuteAccount,
  serverBlockAccount,
  serverUnblockAccount,
  serverBlockDomain,
  serverUnblockDomain
} from "../moderation/server-api";

export type UseModerationOptions = {
  /** Whether the user is connected to a Mastodon instance. */
  connected?: boolean;
  /** Optional fetch implementation for testing. */
  fetchImpl?: typeof fetch;
};

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

  /** Reload moderation lists from localStorage (useful after sync). */
  reload: () => void;
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
export function useModeration(opts: UseModerationOptions = {}): UseModerationResult {
  const { connected = false, fetchImpl } = opts;
  const [muteList, setMuteList] = useState<MuteEntry[]>(() => loadMuteList());
  const [blockList, setBlockList] = useState<BlockEntry[]>(() => loadBlockList());
  const [domainBlockList, setDomainBlockList] = useState<DomainBlock[]>(() => loadDomainBlockList());
  const [contentFilters, setContentFilters] = useState<ContentFilter[]>(() => loadContentFilters());
  const [safeSearchLevel, setSafeSearchLevelState] = useState<SafeSearchLevel>(() => loadSafeSearchLevel());

  /**
   * Push an action to the server. If it fails, queue for later.
   * This is fire-and-forget; local state is already updated.
   */
  const pushToServer = useCallback((action: Parameters<typeof enqueueAction>[0], serverCall: () => Promise<void>) => {
    if (!connected) {
      enqueueAction(action);
      return;
    }
    // Attempt the server call; queue on failure
    serverCall().catch(() => {
      enqueueAction(action);
    });
  }, [connected]);

  const mute = useCallback((accountId: string, options?: { acct?: string; durationMs?: number; hideNotifications?: boolean }) => {
    const updated = addMuteStore(accountId, options);
    setMuteList(updated);
    // Convert durationMs to seconds for server API
    const durationSec = options?.durationMs ? Math.round(options.durationMs / 1000) : undefined;
    pushToServer(
      { type: "mute", accountId, acct: options?.acct, notifications: options?.hideNotifications, duration: durationSec },
      () => serverMuteAccount(accountId, { notifications: options?.hideNotifications, duration: durationSec }, { fetchImpl })
    );
  }, [pushToServer, fetchImpl]);

  const unmute = useCallback((accountId: string) => {
    const updated = removeMuteStore(accountId);
    setMuteList(updated);
    pushToServer(
      { type: "unmute", accountId },
      () => serverUnmuteAccount(accountId, { fetchImpl })
    );
  }, [pushToServer, fetchImpl]);

  const block = useCallback((accountId: string, acct?: string) => {
    const updated = addBlockStore(accountId, acct);
    setBlockList(updated);
    pushToServer(
      { type: "block", accountId, acct },
      () => serverBlockAccount(accountId, { fetchImpl })
    );
  }, [pushToServer, fetchImpl]);

  const unblock = useCallback((accountId: string) => {
    const updated = removeBlockStore(accountId);
    setBlockList(updated);
    pushToServer(
      { type: "unblock", accountId },
      () => serverUnblockAccount(accountId, { fetchImpl })
    );
  }, [pushToServer, fetchImpl]);

  const blockDomain = useCallback((domain: string, reason?: string) => {
    const updated = addDomainBlockStore(domain, reason);
    setDomainBlockList(updated);
    pushToServer(
      { type: "block_domain", domain: domain.trim().toLowerCase() },
      () => serverBlockDomain(domain, { fetchImpl })
    );
  }, [pushToServer, fetchImpl]);

  const unblockDomain = useCallback((domain: string) => {
    const updated = removeDomainBlockStore(domain);
    setDomainBlockList(updated);
    pushToServer(
      { type: "unblock_domain", domain: domain.trim().toLowerCase() },
      () => serverUnblockDomain(domain, { fetchImpl })
    );
  }, [pushToServer, fetchImpl]);

  const addFilter = useCallback((phrase: string, options?: { wholeWord?: boolean; action?: ContentFilterAction; durationMs?: number }) => {
    const updated = addContentFilterStore(phrase, options);
    setContentFilters(updated);
  }, []);

  const removeFilter = useCallback((filterId: string) => {
    const updated = removeContentFilterStore(filterId);
    setContentFilters(updated);
  }, []);

  const updateFilter = useCallback((filterId: string, updates: Partial<Pick<ContentFilter, "phrase" | "wholeWord" | "action" | "expiresAt">>) => {
    const updated = updateContentFilterStore(filterId, updates);
    setContentFilters(updated);
  }, []);

  const setSafeSearchLevel = useCallback((level: SafeSearchLevel) => {
    saveSafeSearchLevel(level);
    setSafeSearchLevelState(level);
  }, []);

  const evaluate = useCallback((input: ModerationInput, context?: ModerationContext): ModerationResult => {
    return evaluateModeration(input, context);
  }, []);

  const reload = useCallback(() => {
    setMuteList(loadMuteList());
    setBlockList(loadBlockList());
    setDomainBlockList(loadDomainBlockList());
    setContentFilters(loadContentFilters());
    setSafeSearchLevelState(loadSafeSearchLevel());
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
    evaluate,
    reload
  }), [
    muteList, blockList, domainBlockList, contentFilters, safeSearchLevel,
    mute, unmute, block, unblock, blockDomain, unblockDomain,
    addFilter, removeFilter, updateFilter, setSafeSearchLevel, evaluate, reload
  ]);
}
