import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useModerationSync } from "./useModerationSync";

describe("useModerationSync", () => {
  const mockStorage = new Map<string, string>();

  beforeEach(() => {
    mockStorage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mockStorage.get(key) ?? null,
      setItem: (key: string, value: string) => { mockStorage.set(key, value); },
      removeItem: (key: string) => { mockStorage.delete(key); }
    });
    // Initialize empty moderation lists
    mockStorage.set("ryu:mute-list", "[]");
    mockStorage.set("ryu:block-list", "[]");
    mockStorage.set("ryu:domain-block-list", "[]");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeFetchImpl() {
    return vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      if (path.includes("/mutes")) {
        return new Response(JSON.stringify([{ id: "s1", acct: "muted@server.tld" }]), { status: 200 });
      }
      if (path.includes("/blocks")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (path.includes("/domain_blocks")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
  }

  it("starts with idle sync state", () => {
    const fetchImpl = makeFetchImpl();
    const { result } = renderHook(() => useModerationSync({ connected: false, fetchImpl }));

    expect(result.current.syncState.status).toBe("idle");
    expect(result.current.isSyncing).toBe(false);
  });

  it("triggers sync automatically on connect", async () => {
    const fetchImpl = makeFetchImpl();
    const { result } = renderHook(() => useModerationSync({ connected: true, fetchImpl }));

    await waitFor(() => {
      expect(result.current.syncState.status).not.toBe("syncing");
    });

    expect(fetchImpl).toHaveBeenCalled();
    expect(result.current.syncState.lastSyncedAt).not.toBeNull();
  });

  it("does not sync when disconnected", async () => {
    const fetchImpl = makeFetchImpl();
    renderHook(() => useModerationSync({ connected: false, fetchImpl }));

    // Give it a tick
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("syncNow does nothing when disconnected", async () => {
    const fetchImpl = makeFetchImpl();
    const { result } = renderHook(() => useModerationSync({ connected: false, fetchImpl }));

    await act(async () => {
      await result.current.syncNow();
    });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sets error state on sync failure", async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError("Network error"); });
    const { result } = renderHook(() => useModerationSync({ connected: true, fetchImpl }));

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("error");
    });

    expect(result.current.syncState.error).toBeDefined();
  });

  it("calls onSyncComplete callback after successful sync", async () => {
    const fetchImpl = makeFetchImpl();
    const onSyncComplete = vi.fn();
    renderHook(() => useModerationSync({ connected: true, fetchImpl, onSyncComplete }));

    await waitFor(() => {
      expect(onSyncComplete).toHaveBeenCalledTimes(1);
    });
  });
});
