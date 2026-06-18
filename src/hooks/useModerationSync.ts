/**
 * Phase 35 - useModerationSync hook.
 *
 * Triggers server sync on connect and exposes sync state.
 * Designed to be used alongside useModeration for a complete experience:
 * - On connect: automatically fetches and merges server moderation state
 * - Exposes sync status (idle, syncing, error) and last synced timestamp
 * - Provides manual syncNow() for retry/refresh
 * - Non-destructive: failures don't affect local state
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { SyncState } from "../moderation/moderation-sync";
import {
  performSync,
  loadSyncState,
  saveSyncState
} from "../moderation/moderation-sync";
import type { ModerationServerApiOptions } from "../moderation/server-api";

export type UseModerationSyncOptions = {
  /** Whether the user is connected to a Mastodon instance. */
  connected: boolean;
  /** Optional fetch implementation for testing. */
  fetchImpl?: typeof fetch;
  /** Callback when sync completes (for refreshing UI state). */
  onSyncComplete?: () => void;
};

export type UseModerationSyncResult = {
  /** Current sync state. */
  syncState: SyncState;
  /** Manually trigger a sync. */
  syncNow: () => Promise<void>;
  /** Whether a sync is currently in progress. */
  isSyncing: boolean;
};

/**
 * Hook that manages moderation sync lifecycle.
 *
 * Usage:
 * ```tsx
 * const { syncState, syncNow, isSyncing } = useModerationSync({ connected });
 * ```
 */
export function useModerationSync(options: UseModerationSyncOptions): UseModerationSyncResult {
  const { connected, fetchImpl, onSyncComplete } = options;
  const [syncState, setSyncState] = useState<SyncState>(() => loadSyncState());
  const abortRef = useRef<AbortController | null>(null);
  const hasSyncedRef = useRef(false);

  const doSync = useCallback(async () => {
    // Cancel any in-flight sync
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const newState: SyncState = { status: "syncing", lastSyncedAt: syncState.lastSyncedAt, error: null };
    setSyncState(newState);
    saveSyncState(newState);

    const apiOptions: ModerationServerApiOptions = {
      fetchImpl,
      signal: controller.signal
    };

    const result = await performSync(apiOptions);

    if (controller.signal.aborted) return;

    if (result.success) {
      const successState: SyncState = {
        status: "idle",
        lastSyncedAt: new Date().toISOString(),
        error: null
      };
      setSyncState(successState);
      saveSyncState(successState);
      onSyncComplete?.();
    } else {
      const errorState: SyncState = {
        status: "error",
        lastSyncedAt: syncState.lastSyncedAt,
        error: result.error ?? "Sync failed"
      };
      setSyncState(errorState);
      saveSyncState(errorState);
    }
  }, [connected, fetchImpl, onSyncComplete, syncState.lastSyncedAt]);

  const syncNow = useCallback(async () => {
    if (!connected) return;
    await doSync();
  }, [connected, doSync]);

  // Auto-sync on connect
  useEffect(() => {
    if (connected && !hasSyncedRef.current) {
      hasSyncedRef.current = true;
      void doSync();
    }
    if (!connected) {
      hasSyncedRef.current = false;
    }
  }, [connected, doSync]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return {
    syncState,
    syncNow,
    isSyncing: syncState.status === "syncing"
  };
}
