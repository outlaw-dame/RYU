import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MuteEntry, BlockEntry, DomainBlock } from "./types";
import type { ServerAccount } from "./server-api";
import {
  mergeMutes,
  mergeBlocks,
  mergeDomainBlocks,
  loadQueue,
  saveQueue,
  enqueueAction,
  clearQueue,
  loadSyncState,
  saveSyncState,
  performSync,
  flushQueue
} from "./moderation-sync";

describe("moderation-sync", () => {
  const mockStorage = new Map<string, string>();

  beforeEach(() => {
    mockStorage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mockStorage.get(key) ?? null,
      setItem: (key: string, value: string) => { mockStorage.set(key, value); },
      removeItem: (key: string) => { mockStorage.delete(key); }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ---------------------------------------------------------------------------
  // Merge logic
  // ---------------------------------------------------------------------------

  describe("mergeMutes", () => {
    it("returns local list when server is empty", () => {
      const local: MuteEntry[] = [
        { accountId: "1", acct: "user1@tld", createdAt: "2024-01-01T00:00:00Z", expiresAt: null, hideNotifications: true }
      ];
      const result = mergeMutes(local, []);
      expect(result).toEqual(local);
    });

    it("adds server entries not present locally", () => {
      const local: MuteEntry[] = [
        { accountId: "1", acct: "user1@tld", createdAt: "2024-01-01T00:00:00Z", expiresAt: null, hideNotifications: true }
      ];
      const server: ServerAccount[] = [
        { id: "2", acct: "user2@tld" }
      ];
      const result = mergeMutes(local, server);
      expect(result).toHaveLength(2);
      expect(result[1].accountId).toBe("2");
      expect(result[1].acct).toBe("user2@tld");
      expect(result[1].hideNotifications).toBe(true);
    });

    it("does not duplicate entries already in local", () => {
      const local: MuteEntry[] = [
        { accountId: "1", acct: "user1@tld", createdAt: "2024-01-01T00:00:00Z", expiresAt: null, hideNotifications: true }
      ];
      const server: ServerAccount[] = [
        { id: "1", acct: "user1@tld" }
      ];
      const result = mergeMutes(local, server);
      expect(result).toHaveLength(1);
    });

    it("preserves local entries even if not on server (local more restrictive wins)", () => {
      const local: MuteEntry[] = [
        { accountId: "1", acct: "user1@tld", createdAt: "2024-01-01T00:00:00Z", expiresAt: null, hideNotifications: true },
        { accountId: "99", acct: "localonly@tld", createdAt: "2024-01-01T00:00:00Z", expiresAt: null, hideNotifications: true }
      ];
      const server: ServerAccount[] = [
        { id: "1", acct: "user1@tld" }
      ];
      const result = mergeMutes(local, server);
      expect(result).toHaveLength(2);
      expect(result.find(e => e.accountId === "99")).toBeDefined();
    });
  });

  describe("mergeBlocks", () => {
    it("merges server blocks into local (union)", () => {
      const local: BlockEntry[] = [
        { accountId: "1", acct: "blocked1@tld", createdAt: "2024-01-01T00:00:00Z" }
      ];
      const server: ServerAccount[] = [
        { id: "1", acct: "blocked1@tld" },
        { id: "2", acct: "blocked2@tld" }
      ];
      const result = mergeBlocks(local, server);
      expect(result).toHaveLength(2);
      expect(result[1].accountId).toBe("2");
    });

    it("preserves local-only blocks", () => {
      const local: BlockEntry[] = [
        { accountId: "local-only", createdAt: "2024-01-01T00:00:00Z" }
      ];
      const result = mergeBlocks(local, []);
      expect(result).toHaveLength(1);
      expect(result[0].accountId).toBe("local-only");
    });
  });

  describe("mergeDomainBlocks", () => {
    it("merges server domains into local (union)", () => {
      const local: DomainBlock[] = [
        { domain: "local.tld", createdAt: "2024-01-01T00:00:00Z" }
      ];
      const server = ["local.tld", "server.tld"];
      const result = mergeDomainBlocks(local, server);
      expect(result).toHaveLength(2);
      expect(result[1].domain).toBe("server.tld");
    });

    it("normalizes server domains", () => {
      const local: DomainBlock[] = [];
      const server = ["  UPPER.TLD  "];
      const result = mergeDomainBlocks(local, server);
      expect(result[0].domain).toBe("upper.tld");
    });
  });

  // ---------------------------------------------------------------------------
  // Queue management
  // ---------------------------------------------------------------------------

  describe("queue", () => {
    it("starts empty", () => {
      expect(loadQueue()).toEqual([]);
    });

    it("persists actions", () => {
      saveQueue([{ type: "mute", accountId: "1" }]);
      expect(loadQueue()).toEqual([{ type: "mute", accountId: "1" }]);
    });

    it("enqueueAction adds to queue", () => {
      const result = enqueueAction({ type: "block", accountId: "1" });
      expect(result).toHaveLength(1);
      expect(loadQueue()).toHaveLength(1);
    });

    it("enqueueAction deduplicates conflicting actions (same target)", () => {
      enqueueAction({ type: "mute", accountId: "1" });
      const result = enqueueAction({ type: "unmute", accountId: "1" });
      // The unmute replaces the mute
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("unmute");
    });

    it("enqueueAction does not deduplicate different targets", () => {
      enqueueAction({ type: "block", accountId: "1" });
      const result = enqueueAction({ type: "block", accountId: "2" });
      expect(result).toHaveLength(2);
    });

    it("enqueueAction deduplicates domain actions", () => {
      enqueueAction({ type: "block_domain", domain: "spam.tld" });
      const result = enqueueAction({ type: "unblock_domain", domain: "spam.tld" });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("unblock_domain");
    });

    it("clearQueue empties the queue", () => {
      enqueueAction({ type: "mute", accountId: "1" });
      clearQueue();
      expect(loadQueue()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Sync state
  // ---------------------------------------------------------------------------

  describe("sync state", () => {
    it("defaults to idle with no history", () => {
      const state = loadSyncState();
      expect(state.status).toBe("idle");
      expect(state.lastSyncedAt).toBeNull();
      expect(state.error).toBeNull();
    });

    it("persists and loads sync state", () => {
      saveSyncState({ status: "error", lastSyncedAt: "2024-01-01T00:00:00Z", error: "Network timeout" });
      const loaded = loadSyncState();
      expect(loaded.status).toBe("error");
      expect(loaded.error).toBe("Network timeout");
    });
  });

  // ---------------------------------------------------------------------------
  // performSync
  // ---------------------------------------------------------------------------

  describe("performSync", () => {
    it("fetches server state and merges with local", async () => {
      // Set up local state
      mockStorage.set("ryu:mute-list", JSON.stringify([
        { accountId: "local-1", acct: "local@tld", createdAt: "2024-01-01T00:00:00Z", expiresAt: null, hideNotifications: true }
      ]));
      mockStorage.set("ryu:block-list", JSON.stringify([]));
      mockStorage.set("ryu:domain-block-list", JSON.stringify([]));

      const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
        const path = String(url);
        if (path.includes("/mutes")) {
          return new Response(JSON.stringify([{ id: "server-1", acct: "server@tld" }]), { status: 200 });
        }
        if (path.includes("/blocks")) {
          return new Response(JSON.stringify([{ id: "blocked-1", acct: "bad@tld" }]), { status: 200 });
        }
        if (path.includes("/domain_blocks")) {
          return new Response(JSON.stringify(["evil.tld"]), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      });

      const result = await performSync({ fetchImpl });

      expect(result.success).toBe(true);
      expect(result.mutesAdded).toBe(1);
      expect(result.blocksAdded).toBe(1);
      expect(result.domainBlocksAdded).toBe(1);

      // Verify local storage was updated
      const mutes = JSON.parse(mockStorage.get("ryu:mute-list")!);
      expect(mutes).toHaveLength(2);

      const blocks = JSON.parse(mockStorage.get("ryu:block-list")!);
      expect(blocks).toHaveLength(1);

      const domains = JSON.parse(mockStorage.get("ryu:domain-block-list")!);
      expect(domains).toHaveLength(1);
    });

    it("returns error result on network failure without losing local state", async () => {
      mockStorage.set("ryu:mute-list", JSON.stringify([
        { accountId: "local-1", acct: "safe@tld", createdAt: "2024-01-01T00:00:00Z", expiresAt: null, hideNotifications: true }
      ]));

      const fetchImpl = vi.fn(async () => { throw new TypeError("Failed to fetch"); });

      const result = await performSync({ fetchImpl });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // Local state preserved
      const mutes = JSON.parse(mockStorage.get("ryu:mute-list")!);
      expect(mutes).toHaveLength(1);
      expect(mutes[0].accountId).toBe("local-1");
    });
  });

  // ---------------------------------------------------------------------------
  // flushQueue
  // ---------------------------------------------------------------------------

  describe("flushQueue", () => {
    it("processes all queued actions", async () => {
      saveQueue([
        { type: "mute", accountId: "1" },
        { type: "block", accountId: "2" }
      ]);

      const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
      const flushed = await flushQueue({ fetchImpl });

      expect(flushed).toBe(2);
      expect(loadQueue()).toEqual([]);
    });

    it("keeps failed actions in queue on network error", async () => {
      saveQueue([
        { type: "mute", accountId: "1" },
        { type: "block", accountId: "2" }
      ]);

      let callCount = 0;
      const fetchImpl = vi.fn(async () => {
        callCount++;
        if (callCount === 1) return new Response("{}", { status: 200 });
        throw new TypeError("Network error");
      });

      const flushed = await flushQueue({ fetchImpl });

      expect(flushed).toBe(1);
      const remaining = loadQueue();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].type).toBe("block");
    });

    it("drops actions that fail with auth error", async () => {
      saveQueue([{ type: "mute", accountId: "1" }]);

      const fetchImpl = vi.fn(async () => new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401 }
      ));

      const flushed = await flushQueue({ fetchImpl });

      expect(flushed).toBe(0);
      // Auth failures are dropped, not re-queued
      expect(loadQueue()).toEqual([]);
    });

    it("returns 0 when queue is empty", async () => {
      const fetchImpl = vi.fn();
      const flushed = await flushQueue({ fetchImpl });
      expect(flushed).toBe(0);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });
});
