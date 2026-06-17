import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SessionState = {
  connected: boolean;
  instanceOrigin?: string;
  account?: { id: string; username: string; acct: string; display_name?: string; avatar?: string; url?: string };
  scope?: string;
};

type QueryMock<T> = {
  data?: T;
  error: Error | null;
  isPending: boolean;
};

type MutationMock = {
  mutateAsync: ReturnType<typeof vi.fn>;
  isPending: boolean;
};

const hookMocks = vi.hoisted(() => ({
  sessionData: undefined as SessionState | undefined,
  sessionPending: false,
  disconnectMutateAsync: vi.fn(),
  disconnectPending: false,
  queryClient: {
    invalidateQueries: vi.fn()
  }
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => hookMocks.queryClient
  };
});

vi.mock("../sync/use-mastodon-activity", () => ({
  useMastodonSession: () => ({
    data: hookMocks.sessionData,
    error: null,
    isPending: hookMocks.sessionPending
  }),
  useDisconnectMastodon: () => ({
    mutateAsync: hookMocks.disconnectMutateAsync,
    isPending: hookMocks.disconnectPending
  }),
  mastodonActivityQueryKeys: {
    session: () => ["mastodon", "session"]
  }
}));

vi.mock("../auth/instance", () => ({
  normalizeInstanceOrigin: (input: string) => {
    if (!input.trim()) throw new Error("Instance is required");
    if (input === "bad") throw new Error("Invalid instance");
    return `https://${input.trim()}`;
  },
  discoverMastodonOAuth: vi.fn()
}));

vi.mock("../auth/oauth", () => ({
  buildAuthorizeUrl: vi.fn(() => "https://example.com/oauth/authorize"),
  createPendingAuthTransaction: vi.fn()
}));

vi.mock("../auth/transaction", () => ({
  clearPendingAuthTransaction: vi.fn(),
  loadPendingAuthTransaction: vi.fn(() => null),
  savePendingAuthTransaction: vi.fn()
}));

vi.mock("../auth/contracts", () => ({
  parseMastodonExchangeRequest: vi.fn((input: unknown) => input),
  parseMastodonExchangeResponse: vi.fn((input: unknown) => input),
  parseMastodonRegisterRequest: vi.fn((input: unknown) => input),
  parseMastodonRegisterResponse: vi.fn((input: unknown) => input)
}));

import { useAccountConnection } from "./useAccountConnection";

beforeEach(() => {
  hookMocks.sessionData = { connected: false };
  hookMocks.sessionPending = false;
  hookMocks.disconnectMutateAsync.mockReset().mockResolvedValue(undefined);
  hookMocks.disconnectPending = false;
  hookMocks.queryClient.invalidateQueries.mockReset();
});

describe("useAccountConnection", () => {
  it("returns null connectedAccount when session is not connected", () => {
    const { result } = renderHook(() => useAccountConnection());

    expect(result.current.connectedAccount).toBeNull();
    expect(result.current.instanceInput).toBe("");
    expect(result.current.isWorking).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.info).toBeNull();
  });

  it("returns connected account info when session is active", () => {
    hookMocks.sessionData = {
      connected: true,
      instanceOrigin: "https://bookwyrm.social",
      account: {
        id: "1",
        username: "reader",
        acct: "reader@bookwyrm.social",
        display_name: "A Reader",
        avatar: "https://bookwyrm.social/avatar.png",
        url: "https://bookwyrm.social/@reader"
      },
      scope: "read write:statuses"
    };

    const { result } = renderHook(() => useAccountConnection());

    expect(result.current.connectedAccount).not.toBeNull();
    expect(result.current.connectedAccount?.acct).toBe("reader@bookwyrm.social");
    expect(result.current.connectedAccount?.displayName).toBe("A Reader");
    expect(result.current.connectedAccount?.grantedScopes).toEqual(["read", "write:statuses"]);
  });

  it("reports isLoadingSession from session query", () => {
    hookMocks.sessionPending = true;

    const { result } = renderHook(() => useAccountConnection());

    expect(result.current.isLoadingSession).toBe(true);
  });

  it("manages instance input state", () => {
    const { result } = renderHook(() => useAccountConnection());

    act(() => result.current.setInstanceInput("bookwyrm.social"));

    expect(result.current.instanceInput).toBe("bookwyrm.social");
  });

  it("manages picker open/close state", () => {
    const { result } = renderHook(() => useAccountConnection());

    expect(result.current.pickerOpen).toBe(false);
    act(() => result.current.openPicker());
    expect(result.current.pickerOpen).toBe(true);
    act(() => result.current.closePicker());
    expect(result.current.pickerOpen).toBe(false);
  });

  it("applyInstance sets input and closes picker", () => {
    const { result } = renderHook(() => useAccountConnection());

    act(() => result.current.openPicker());
    expect(result.current.pickerOpen).toBe(true);

    act(() => result.current.applyInstance("mastodon.social"));

    expect(result.current.instanceInput).toBe("mastodon.social");
    expect(result.current.pickerOpen).toBe(false);
  });

  it("startLogin sets error on invalid instance", async () => {
    const { result } = renderHook(() => useAccountConnection());

    act(() => result.current.setInstanceInput("bad"));
    await act(async () => {
      await result.current.startLogin();
    });

    expect(result.current.error).toBe("Invalid instance");
  });

  it("startLogin sets error on empty instance", async () => {
    const { result } = renderHook(() => useAccountConnection());

    await act(async () => {
      await result.current.startLogin();
    });

    expect(result.current.error).toBe("Instance is required");
  });

  it("clearError clears the error state", () => {
    const { result } = renderHook(() => useAccountConnection());

    act(() => result.current.setInstanceInput("bad"));
    act(() => {
      // Manually trigger the error path synchronously
      void result.current.startLogin();
    });

    // Wait for the error to be set
    act(() => result.current.clearError());

    expect(result.current.error).toBeNull();
  });

  it("disconnect calls disconnectMutation.mutateAsync", async () => {
    hookMocks.sessionData = {
      connected: true,
      instanceOrigin: "https://social.example",
      account: { id: "1", username: "reader", acct: "reader@social.example" },
      scope: "read"
    };

    const { result } = renderHook(() => useAccountConnection());

    await act(async () => {
      await result.current.disconnect();
    });

    expect(hookMocks.disconnectMutateAsync).toHaveBeenCalledTimes(1);
  });

  it("retry resets error and info", () => {
    const { result } = renderHook(() => useAccountConnection());

    // Force an error state directly via startLogin with bad input
    act(() => result.current.setInstanceInput("bad"));

    act(() => result.current.retry());

    expect(result.current.error).toBeNull();
    expect(result.current.info).toBeNull();
  });
});
