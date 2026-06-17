import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MastodonNotification, MastodonPage, MastodonStatus } from "../sync/mastodon-client";
import { MastodonActivityApiError, type MastodonSessionState } from "../sync/mastodon-activity-api";

type QueryMock<T> = {
  data?: T;
  dataUpdatedAt?: number;
  error: Error | null;
  isLoading: boolean;
  isFetching: boolean;
  isPending: boolean;
  refetch: ReturnType<typeof vi.fn>;
};

type MutationMock = {
  mutateAsync: ReturnType<typeof vi.fn>;
  isPending: boolean;
};

type HookState = {
  session: QueryMock<MastodonSessionState>;
  homeTimeline: QueryMock<MastodonPage<MastodonStatus>>;
  notifications: QueryMock<MastodonPage<MastodonNotification>>;
  disconnect: MutationMock;
};

const hookMocks = vi.hoisted(() => ({
  state: {} as HookState,
  disconnectMutateAsync: vi.fn(),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn()
  },
  favouriteStatus: vi.fn(),
  unfavouriteStatus: vi.fn(),
  bookmarkStatus: vi.fn(),
  unbookmarkStatus: vi.fn(),
  shelves: {
    addBookmark: vi.fn(),
    removeBookmark: vi.fn(),
    addFavourite: vi.fn(),
    removeFavourite: vi.fn()
  }
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => hookMocks.queryClient
  };
});

vi.mock("../sync/use-mastodon-activity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../sync/use-mastodon-activity")>();
  return {
    ...actual,
    useMastodonSession: () => hookMocks.state.session,
    useMastodonHomeTimeline: () => hookMocks.state.homeTimeline,
    useMastodonNotifications: () => hookMocks.state.notifications,
    useDisconnectMastodon: () => hookMocks.state.disconnect
  };
});

vi.mock("../sync/mastodon-activity-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../sync/mastodon-activity-api")>();
  return {
    ...actual,
    favouriteStatus: hookMocks.favouriteStatus,
    unfavouriteStatus: hookMocks.unfavouriteStatus,
    bookmarkStatus: hookMocks.bookmarkStatus,
    unbookmarkStatus: hookMocks.unbookmarkStatus
  };
});

vi.mock("../hooks/useMastodonShelves", () => ({
  useMastodonShelves: () => ({
    bookmarks: [],
    favourites: [],
    lists: [],
    loading: false,
    error: null,
    reload: vi.fn(),
    addBookmark: hookMocks.shelves.addBookmark,
    removeBookmark: hookMocks.shelves.removeBookmark,
    addFavourite: hookMocks.shelves.addFavourite,
    removeFavourite: hookMocks.shelves.removeFavourite
  })
}));

import { useActivityTab, hasWriteScope } from "./useActivityTab";

beforeEach(() => {
  hookMocks.disconnectMutateAsync.mockReset();
  hookMocks.disconnectMutateAsync.mockResolvedValue(undefined);
  hookMocks.queryClient.invalidateQueries.mockReset();
  hookMocks.queryClient.setQueryData.mockReset();
  hookMocks.favouriteStatus.mockReset();
  hookMocks.unfavouriteStatus.mockReset();
  hookMocks.bookmarkStatus.mockReset();
  hookMocks.unbookmarkStatus.mockReset();
  hookMocks.shelves.addBookmark.mockReset();
  hookMocks.shelves.removeBookmark.mockReset();
  hookMocks.shelves.addFavourite.mockReset();
  hookMocks.shelves.removeFavourite.mockReset();
  hookMocks.state = defaultHookState();
});

describe("useActivityTab", () => {
  it("returns null connectedAccount when signed out", () => {
    const { result } = renderHook(() => useActivityTab());

    expect(result.current.connectedAccount).toBeNull();
    expect(result.current.timeline).toEqual([]);
    expect(result.current.notifications).toEqual([]);
    expect(result.current.isLoadingActivity).toBe(false);
    expect(result.current.activityError).toBeNull();
  });

  it("exposes connected account when session is active", () => {
    hookMocks.state.session = query({ data: connectedSession() });

    const { result } = renderHook(() => useActivityTab());

    expect(result.current.connectedAccount).not.toBeNull();
    expect(result.current.connectedAccount?.acct).toBe("reader@social.example");
    expect(result.current.connectedAccount?.instanceOrigin).toBe("https://social.example");
  });

  it("reports loading session state", () => {
    hookMocks.state.session = query({ isPending: true });

    const { result } = renderHook(() => useActivityTab());

    expect(result.current.isLoadingSession).toBe(true);
  });

  it("exposes timeline and notification items", () => {
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.state.homeTimeline = query({
      data: page([statusPayload("41", "Reading Dune")])
    });
    hookMocks.state.notifications = query({
      data: page([notificationPayload("51", "favourite", statusPayload("42", "Loved it"))])
    });

    const { result } = renderHook(() => useActivityTab());

    expect(result.current.timeline).toHaveLength(1);
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.timeline[0].id).toBe("41");
    expect(result.current.notifications[0].id).toBe("51");
  });

  it("reports isLoadingActivity when connected and fetching", () => {
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.state.homeTimeline = query({ isFetching: true });

    const { result } = renderHook(() => useActivityTab());

    expect(result.current.isLoadingActivity).toBe(true);
  });

  it("does not report loading when signed out", () => {
    hookMocks.state.homeTimeline = query({ isFetching: true });

    const { result } = renderHook(() => useActivityTab());

    expect(result.current.isLoadingActivity).toBe(false);
  });

  it("maps 401 errors as reconnect-required", () => {
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.state.homeTimeline = query({
      data: page<MastodonStatus>([]),
      error: new MastodonActivityApiError(401, "auth", "upstream auth failure")
    });

    const { result } = renderHook(() => useActivityTab());

    expect(result.current.reconnectRequired).toBe(true);
    expect(result.current.activityError).toContain("Session expired");
  });

  it("maps rate-limit errors correctly", () => {
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.state.homeTimeline = query({
      data: page<MastodonStatus>([]),
      error: new MastodonActivityApiError(429, "rate_limited", "too many requests")
    });

    const { result } = renderHook(() => useActivityTab());

    expect(result.current.reconnectRequired).toBe(false);
    expect(result.current.activityErrorState?.kind).toBe("rate-limited");
  });

  it("maps generic network errors as refresh-failed", () => {
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.state.homeTimeline = query({
      data: page<MastodonStatus>([]),
      error: new Error("ECONNRESET")
    });

    const { result } = renderHook(() => useActivityTab());

    expect(result.current.reconnectRequired).toBe(false);
    expect(result.current.activityErrorState?.kind).toBe("refresh-failed");
  });

  it("manages compose open/close state", () => {
    hookMocks.state.session = query({ data: connectedSession() });

    const { result } = renderHook(() => useActivityTab());

    expect(result.current.composeOpen).toBe(false);
    act(() => result.current.openCompose());
    expect(result.current.composeOpen).toBe(true);
    act(() => result.current.closeCompose());
    expect(result.current.composeOpen).toBe(false);
  });

  it("closes compose and updates cache on posted", () => {
    hookMocks.state.session = query({ data: connectedSession() });

    const { result } = renderHook(() => useActivityTab());

    act(() => result.current.openCompose());
    expect(result.current.composeOpen).toBe(true);

    const posted = statusPayload("99", "New post");
    act(() => result.current.handlePosted(posted));

    expect(result.current.composeOpen).toBe(false);
    expect(hookMocks.queryClient.setQueryData).toHaveBeenCalledTimes(1);
  });

  it("refresh invalidates timeline and notification queries", () => {
    hookMocks.state.session = query({ data: connectedSession() });

    const { result } = renderHook(() => useActivityTab());

    act(() => result.current.refresh());

    expect(hookMocks.queryClient.invalidateQueries).toHaveBeenCalledTimes(2);
  });

  it("applies optimistic favourite interaction", () => {
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.favouriteStatus.mockResolvedValue(statusPayload("41", "fav'd"));

    const { result } = renderHook(() => useActivityTab());

    act(() => result.current.handleFavourite("41", false));

    expect(result.current.statusInteractions.get("41")).toEqual({
      favourited: true,
      bookmarked: false
    });
  });

  it("applies optimistic bookmark interaction", () => {
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.bookmarkStatus.mockResolvedValue(statusPayload("41", "bookmarked"));

    const { result } = renderHook(() => useActivityTab());

    act(() => result.current.handleBookmark("41", false));

    expect(result.current.statusInteractions.get("41")).toEqual({
      favourited: false,
      bookmarked: true
    });
  });

  it("provides disconnect handler", () => {
    hookMocks.state.session = query({ data: connectedSession() });

    const { result } = renderHook(() => useActivityTab());

    act(() => result.current.disconnect());

    expect(hookMocks.disconnectMutateAsync).toHaveBeenCalledTimes(1);
  });

  it("reports isDisconnecting state", () => {
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.state.disconnect = { mutateAsync: hookMocks.disconnectMutateAsync, isPending: true };

    const { result } = renderHook(() => useActivityTab());

    expect(result.current.isDisconnecting).toBe(true);
  });

  it("exposes loadedAt from homeTimeline dataUpdatedAt", () => {
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.state.homeTimeline = query({
      data: page([statusPayload("41", "test")]),
      dataUpdatedAt: 1714300800000
    });

    const { result } = renderHook(() => useActivityTab());

    expect(result.current.loadedAt).toBe(1714300800000);
  });
});

describe("hasWriteScope", () => {
  it("returns true when scopes are unknown (optimistic)", () => {
    expect(hasWriteScope(undefined, "write:statuses")).toBe(true);
    expect(hasWriteScope([], "write:statuses")).toBe(true);
  });

  it("returns true when the exact scope is present", () => {
    expect(hasWriteScope(["read", "write:statuses"], "write:statuses")).toBe(true);
  });

  it("returns true when base scope is granted", () => {
    expect(hasWriteScope(["write"], "write:statuses")).toBe(true);
  });

  it("returns false when scope is missing", () => {
    expect(hasWriteScope(["read", "write:favourites"], "write:statuses")).toBe(false);
  });
});

function defaultHookState(): HookState {
  return {
    session: query({ data: { connected: false } }),
    homeTimeline: query({ data: page<MastodonStatus>([]) }),
    notifications: query({ data: page<MastodonNotification>([]) }),
    disconnect: { mutateAsync: hookMocks.disconnectMutateAsync, isPending: false }
  };
}

function query<T>(overrides: Partial<QueryMock<T>> = {}): QueryMock<T> {
  return {
    data: undefined,
    dataUpdatedAt: undefined,
    error: null,
    isLoading: false,
    isFetching: false,
    isPending: false,
    refetch: vi.fn(),
    ...overrides
  };
}

function page<T>(items: T[]): MastodonPage<T> {
  return { items, links: {} };
}

function connectedSession(): MastodonSessionState {
  return {
    connected: true,
    instanceOrigin: "https://social.example",
    account: { id: "1", username: "reader", acct: "reader@social.example" },
    scope: "profile read write:statuses write:favourites write:bookmarks"
  };
}

function statusPayload(id: string, content: string): MastodonStatus {
  return {
    id,
    uri: `https://social.example/users/reader/statuses/${id}`,
    url: `https://social.example/@reader/${id}`,
    created_at: "2026-04-29T00:00:00.000Z",
    content: `<p>${content}</p>`,
    account: { id: "1", username: "reader", acct: "reader@social.example" }
  } as MastodonStatus;
}

function notificationPayload(id: string, type: string, status: MastodonStatus): MastodonNotification {
  return {
    id,
    type,
    created_at: "2026-04-29T00:00:00.000Z",
    account: { id: "2", username: "reader2", acct: "reader2@social.example" },
    status
  } as MastodonNotification;
}
