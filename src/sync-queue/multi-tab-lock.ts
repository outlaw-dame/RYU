/**
 * Phase 30: Multi-tab lock coordination.
 *
 * Uses BroadcastChannel to prevent multiple tabs from processing
 * the same queue entries simultaneously. Gracefully degrades in
 * environments without BroadcastChannel support.
 */

import type { TabLockMessage } from './types';

const DEFAULT_CHANNEL_NAME = 'ryu:sync-queue-lock';
const HEARTBEAT_INTERVAL_MS = 5000;
const CLAIM_TIMEOUT_MS = 30_000;

export type MultiTabLock = {
  /** Attempt to claim an entry for processing. Returns true if claimed. */
  claim(entryId: string): boolean;
  /** Release a previously claimed entry. */
  release(entryId: string): void;
  /** Check if an entry is claimed by another tab. */
  isClaimedByOther(entryId: string): boolean;
  /** Get the current tab's ID. */
  tabId(): string;
  /** Destroy the lock (cleanup channel and intervals). */
  destroy(): void;
};

export type MultiTabLockOptions = {
  channelName?: string;
  heartbeatIntervalMs?: number;
  claimTimeoutMs?: number;
};

function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createMultiTabLock(options: MultiTabLockOptions = {}): MultiTabLock {
  const channelName = options.channelName ?? DEFAULT_CHANNEL_NAME;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
  const claimTimeoutMs = options.claimTimeoutMs ?? CLAIM_TIMEOUT_MS;
  const currentTabId = generateTabId();

  // Claims tracked across all tabs: entryId -> { tabId, timestamp }
  const claims = new Map<string, { tabId: string; timestamp: string }>();
  let channel: BroadcastChannel | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // Initialize BroadcastChannel if available
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(channelName);
      channel.onmessage = (event: MessageEvent<TabLockMessage>) => {
        handleMessage(event.data);
      };
    } catch {
      // BroadcastChannel not available - single-tab mode
      channel = null;
    }
  }

  // Start heartbeat
  heartbeatTimer = setInterval(() => {
    sendMessage({ type: 'heartbeat', tabId: currentTabId, timestamp: nowIso() });
    pruneExpiredClaims();
  }, heartbeatIntervalMs);

  function sendMessage(msg: TabLockMessage): void {
    try {
      channel?.postMessage(msg);
    } catch {
      // Channel closed or unavailable
    }
  }

  function handleMessage(msg: TabLockMessage): void {
    switch (msg.type) {
      case 'claim':
        // Another tab claimed an entry
        if (msg.tabId !== currentTabId) {
          claims.set(msg.entryId, { tabId: msg.tabId, timestamp: msg.timestamp });
        }
        break;
      case 'release':
        // Another tab released an entry
        if (msg.tabId !== currentTabId) {
          const existing = claims.get(msg.entryId);
          if (existing && existing.tabId === msg.tabId) {
            claims.delete(msg.entryId);
          }
        }
        break;
      case 'heartbeat':
        // Update last-seen for the tab (used for stale claim detection)
        break;
    }
  }

  function pruneExpiredClaims(): void {
    const now = Date.now();
    for (const [entryId, claim] of claims) {
      if (now - Date.parse(claim.timestamp) > claimTimeoutMs) {
        claims.delete(entryId);
      }
    }
  }

  function claim(entryId: string): boolean {
    // Check if another tab already holds this claim
    const existing = claims.get(entryId);
    if (existing && existing.tabId !== currentTabId) {
      // Check if the claim is stale
      if (Date.now() - Date.parse(existing.timestamp) < claimTimeoutMs) {
        return false; // Another tab holds a valid claim
      }
      // Claim is stale, take over
    }

    const timestamp = nowIso();
    claims.set(entryId, { tabId: currentTabId, timestamp });
    sendMessage({ type: 'claim', entryId, tabId: currentTabId, timestamp });
    return true;
  }

  function release(entryId: string): void {
    const existing = claims.get(entryId);
    if (existing && existing.tabId === currentTabId) {
      claims.delete(entryId);
      sendMessage({ type: 'release', entryId, tabId: currentTabId });
    }
  }

  function isClaimedByOther(entryId: string): boolean {
    const existing = claims.get(entryId);
    if (!existing) return false;
    if (existing.tabId === currentTabId) return false;
    // Check staleness
    return Date.now() - Date.parse(existing.timestamp) < claimTimeoutMs;
  }

  function tabId(): string {
    return currentTabId;
  }

  function destroy(): void {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    try {
      channel?.close();
    } catch {
      // Already closed
    }
    channel = null;
    claims.clear();
  }

  return { claim, release, isClaimedByOther, tabId, destroy };
}
