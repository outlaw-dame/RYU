/**
 * Phase 35 - Moderation sync engine.
 *
 * Responsible for:
 * 1. Fetching server-side moderation state (mutes, blocks, domain blocks)
 * 2. Merging with local state (union merge, local "more restrictive" wins)
 * 3. Pushing queued actions to the server when connected
 * 4. Tracking sync state (last synced, syncing, errors)
 *
 * The sync engine is designed to be non-destructive:
 * - Network failures never lose local state
 * - Merge always produces a union (never removes local entries)
 * - Queued actions are persisted to localStorage for crash safety
 */

import type { MuteEntry, BlockEntry, DomainBlock } from "./types";
import type { ServerAccount, ModerationServerApiOptions } from "./server-api";
import {
  fetchServerMutes,
  fetchServerBlocks,
  fetchServerDomainBlocks,
  serverMuteAccount,
  serverUnmuteAccount,
  serverBlockAccount,
  serverUnblockAccount,
  serverBlockDomain,
  serverUnblockDomain,
  ModerationServerApiError
} from "./server-api";
import { loadMuteList, saveMuteList } from "./mute-store";
import { loadBlockList, saveBlockList } from "./block-store";
import { loadDomainBlockList, saveDomainBlockList, normalizeDomain } from "./domain-block-store";

// ---------------------------------------------------------------------------
// Sync state types
// ---------------------------------------------------------------------------

export type SyncState = {
  status: "idle" | "syncing" | "error";
  lastSyncedAt: string | null;
  error: string | null;
};

export type QueuedAction =
  | { type: "mute"; accountId: string; acct?: string; notifications?: boolean; duration?: number }
  | { type: "unmute"; accountId: string }
  | { type: "block"; accountId: string; acct?: string }
  | { type: "unblock"; accountId: string }
  | { type: "block_domain"; domain: string }
  | { type: "unblock_domain"; domain: string };

// ---------------------------------------------------------------------------
// Queue persistence
// ---------------------------------------------------------------------------

const QUEUE_STORAGE_KEY = "ryu:moderation-sync-queue";
const SYNC_STATE_STORAGE_KEY = "ryu:moderation-sync-state";

/**
 * Load the pending action queue from localStorage.
 */
export function loadQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedAction[];
  } catch {
    return [];
  }
}

/**
 * Save the pending action queue to localStorage.
 */
export function saveQueue(queue: QueuedAction[]): void {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or unavailable
  }
}

/**
 * Add an action to the queue.
 */
export function enqueueAction(action: QueuedAction): QueuedAction[] {
  const queue = loadQueue();
  // Deduplicate: remove conflicting actions for the same target
  const filtered = queue.filter((existing) => !isConflicting(existing, action));
  filtered.push(action);
  saveQueue(filtered);
  return filtered;
}

/**
 * Clear the queue.
 */
export function clearQueue(): void {
  saveQueue([]);
}

/**
 * Check if two actions conflict (same target, opposite or same direction).
 * E.g., mute + unmute same account, or block + block same account.
 */
function isConflicting(a: QueuedAction, b: QueuedAction): boolean {
  if (a.type === "mute" || a.type === "unmute") {
    if (b.type === "mute" || b.type === "unmute") {
      return a.accountId === b.accountId;
    }
  }
  if (a.type === "block" || a.type === "unblock") {
    if (b.type === "block" || b.type === "unblock") {
      return a.accountId === b.accountId;
    }
  }
  if (a.type === "block_domain" || a.type === "unblock_domain") {
    if (b.type === "block_domain" || b.type === "unblock_domain") {
      return a.domain === b.domain;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Sync state persistence
// ---------------------------------------------------------------------------

/**
 * Load persisted sync state.
 */
export function loadSyncState(): SyncState {
  try {
    const raw = localStorage.getItem(SYNC_STATE_STORAGE_KEY);
    if (!raw) return { status: "idle", lastSyncedAt: null, error: null };
    return JSON.parse(raw) as SyncState;
  } catch {
    return { status: "idle", lastSyncedAt: null, error: null };
  }
}

/**
 * Save sync state to localStorage.
 */
export function saveSyncState(state: SyncState): void {
  try {
    localStorage.setItem(SYNC_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable
  }
}

// ---------------------------------------------------------------------------
// Merge logic
// ---------------------------------------------------------------------------

/**
 * Merge server mutes with local mutes.
 * Union strategy: all server mutes are added locally if not already present.
 * Local entries are never removed (local "more restrictive" wins).
 */
export function mergeMutes(local: MuteEntry[], server: ServerAccount[]): MuteEntry[] {
  const localIds = new Set(local.map((e) => e.accountId));
  const merged = [...local];

  for (const account of server) {
    if (!localIds.has(account.id)) {
      merged.push({
        accountId: account.id,
        acct: account.acct,
        createdAt: new Date().toISOString(),
        expiresAt: null,
        hideNotifications: true
      });
    }
  }

  return merged;
}

/**
 * Merge server blocks with local blocks.
 * Union strategy: all server blocks are added locally if not already present.
 */
export function mergeBlocks(local: BlockEntry[], server: ServerAccount[]): BlockEntry[] {
  const localIds = new Set(local.map((e) => e.accountId));
  const merged = [...local];

  for (const account of server) {
    if (!localIds.has(account.id)) {
      merged.push({
        accountId: account.id,
        acct: account.acct,
        createdAt: new Date().toISOString()
      });
    }
  }

  return merged;
}

/**
 * Merge server domain blocks with local domain blocks.
 * Union strategy: all server domains are added locally if not already present.
 */
export function mergeDomainBlocks(local: DomainBlock[], server: string[]): DomainBlock[] {
  const localDomains = new Set(local.map((e) => e.domain));
  const merged = [...local];

  for (const domain of server) {
    const normalized = normalizeDomain(domain);
    if (!localDomains.has(normalized)) {
      merged.push({
        domain: normalized,
        createdAt: new Date().toISOString()
      });
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Sync operations
// ---------------------------------------------------------------------------

export type SyncResult = {
  success: boolean;
  error?: string;
  mutesAdded: number;
  blocksAdded: number;
  domainBlocksAdded: number;
  queueFlushed: number;
};

/**
 * Perform a full sync cycle:
 * 1. Flush any queued actions to the server
 * 2. Fetch server state
 * 3. Merge with local state
 * 4. Persist merged state
 *
 * Returns a SyncResult describing what changed.
 */
export async function performSync(options: ModerationServerApiOptions = {}): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    mutesAdded: 0,
    blocksAdded: 0,
    domainBlocksAdded: 0,
    queueFlushed: 0
  };

  try {
    // Step 1: Flush queued actions
    const queueFlushed = await flushQueue(options);
    result.queueFlushed = queueFlushed;

    // Step 2: Fetch server state (parallel)
    const [serverMutes, serverBlocks, serverDomainBlocks] = await Promise.all([
      fetchServerMutes(options),
      fetchServerBlocks(options),
      fetchServerDomainBlocks(options)
    ]);

    // Step 3: Merge with local state
    const localMutes = loadMuteList();
    const localBlocks = loadBlockList();
    const localDomainBlocks = loadDomainBlockList();

    const mergedMutes = mergeMutes(localMutes, serverMutes);
    const mergedBlocks = mergeBlocks(localBlocks, serverBlocks);
    const mergedDomainBlocks = mergeDomainBlocks(localDomainBlocks, serverDomainBlocks);

    // Step 4: Persist
    result.mutesAdded = mergedMutes.length - localMutes.length;
    result.blocksAdded = mergedBlocks.length - localBlocks.length;
    result.domainBlocksAdded = mergedDomainBlocks.length - localDomainBlocks.length;

    saveMuteList(mergedMutes);
    saveBlockList(mergedBlocks);
    saveDomainBlockList(mergedDomainBlocks);

    result.success = true;
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Sync failed";
    return result;
  }
}

/**
 * Flush all queued actions to the server.
 * Actions that fail with auth errors are dropped.
 * Actions that fail with network errors remain in the queue.
 * Returns the number of successfully flushed actions.
 */
export async function flushQueue(options: ModerationServerApiOptions = {}): Promise<number> {
  const queue = loadQueue();
  if (queue.length === 0) return 0;

  const remaining: QueuedAction[] = [];
  let flushed = 0;

  for (const action of queue) {
    try {
      await executeAction(action, options);
      flushed++;
    } catch (error) {
      if (error instanceof ModerationServerApiError && error.isAuthError) {
        // Drop actions that fail due to auth - they will never succeed
        continue;
      }
      // Keep actions that failed due to network issues
      remaining.push(action);
    }
  }

  saveQueue(remaining);
  return flushed;
}

/**
 * Execute a single queued action against the server.
 */
async function executeAction(action: QueuedAction, options: ModerationServerApiOptions): Promise<void> {
  switch (action.type) {
    case "mute":
      await serverMuteAccount(action.accountId, {
        notifications: action.notifications,
        duration: action.duration
      }, options);
      break;
    case "unmute":
      await serverUnmuteAccount(action.accountId, options);
      break;
    case "block":
      await serverBlockAccount(action.accountId, options);
      break;
    case "unblock":
      await serverUnblockAccount(action.accountId, options);
      break;
    case "block_domain":
      await serverBlockDomain(action.domain, options);
      break;
    case "unblock_domain":
      await serverUnblockDomain(action.domain, options);
      break;
  }
}
