import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookTokTrend } from "../sync/booktok-trending";
import type { MastodonNotification, MastodonPage, MastodonStatus } from "../sync/mastodon-client";
import { MastodonActivityApiError, type MastodonSessionState } from "../sync/mastodon-activity-api";

type QueryMock<T> = {
  data?: T;
  error: Error | null;
  isLoading: boolean;
  isPending: boolean;
  refetch: ReturnType<typeof vi.fn>;
};

type HookState = {
  session: QueryMock<MastodonSessionState>;
  homeTimeline: QueryMock<MastodonPage<MastodonStatus>>;
  notifications: QueryMock<MastodonPage<MastodonNotification>>;
  accountStatuses: QueryMock<MastodonPage<MastodonStatus>>;
  trends: QueryMock<BookTokTrend[]>;
};

const hookMocks = vi.hoisted(() => ({
  state: {} as HookState,
  useBookTokTrends: vi.fn(),
  useMastodonAccountStatuses: vi.fn(),
  useMastodonHomeTimeline: vi.fn(),
  useMastodonNotifications: vi.fn(),
  useMastodonSession: vi.fn()
}));

vi.mock("../sync/use-mastodon-activity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../sync/use-mastodon-activity")>();
  return {
    ...actual,
    useBookTokTrends: hookMocks.useBookTokTrends,
    useMastodonAccountStatuses: hookMocks.useMastodonAccountStatuses,
    useMastodonHomeTimeline: hookMocks.useMastodonHomeTimeline,
    useMastodonNotifications: hookMocks.useMastodonNotifications,
    useMastodonSession: hookMocks.useMastodonSession
  };
});

import { CURATED_BOOKTOK_TRENDS } from "../sync/booktok-trending";
import { useMastodonActivitySurface } from "./useMastodonActivitySurface";

beforeEach(() => {
  hookMocks.state = defaultHookState();
  hookMocks.useMastodonSession.mockReset();
  hookMocks.useMastodonHomeTimeline.mockReset();
  hookMocks.useMastodonNotifications.mockReset();
  hookMocks.useMastodonAccountStatuses.mockReset();
  hookMocks.useBookTokTrends.mockReset();
  hookMocks.useMastodonSession.mockImplementation(() => hookMocks.state.session);
  hookMocks.useMastodonHomeTimeline.mockImplementation(() => hookMocks.state.homeTimeline);
  hookMocks.useMastodonNotifications.mockImplementation(() => hookMocks.state.notifications);
  hookMocks.useMastodonAccountStatuses.mockImplementation(() => hookMocks.state.accountStatuses);
  hookMocks.useBookTokTrends.mockImplementation(() => hookMocks.state.trends);
});

describe("useMastodonActivitySurface", () => {
  it("keeps account activity disabled until a connected account exists", () => {
    const { result } = renderHook(() => useMastodonActivitySurface(true));

    expect(result.current.connected).toBe(false);
    expect(result.current.activityEnabled).toBe(false);
    expect(result.current.accountLabel).toBe("your account");
    expect(hookMocks.useMastodonHomeTimeline).toHaveBeenCalledWith({ enabled: false, limit: 20 });
    expect(hookMocks.useMastodonNotifications).toHaveBeenCalledWith({ enabled: false, limit: 20 });
    expect(hookMocks.useMastodonAccountStatuses).toHaveBeenCalledWith({ enabled: false, limit: 10 });
  });

  it("exposes a connected account activity model", () => {
    const status = statusPayload("41", "Reading Dune tonight");
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.state.homeTimeline = query({ data: page([status]) });

    const { result } = renderHook(() => useMastodonActivitySurface(true));

    expect(result.current.connected).toBe(true);
    expect(result.current.activityEnabled).toBe(true);
    expect(result.current.accountLabel).toBe("reader@social.example");
    expect(result.current.timelineItems).toEqual([status]);
    expect(result.current.hasAnyActivity).toBe(true);
  });

  it("uses curated BookTok trends as a safe fallback", () => {
    hookMocks.state.trends = query({ data: [] });

    const { result } = renderHook(() => useMastodonActivitySurface(true));

    expect(result.current.trendItems).toEqual(CURATED_BOOKTOK_TRENDS);
  });

  it("keeps BookTok fallback errors out of the primary activity error while preserving observability", () => {
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.state.trends = query({
      data: [],
      error: new MastodonActivityApiError(503, "trend_unavailable", "trend sync unavailable")
    });

    const { result } = renderHook(() => useMastodonActivitySurface(true));

    expect(result.current.activityError).toBeNull();
    expect(result.current.trendError).toMatchObject({ kind: "refresh-failed" });
    expect(result.current.trendItems).toEqual(CURATED_BOOKTOK_TRENDS);
  });

  it("maps auth errors through the centralized activity error model", () => {
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.state.homeTimeline = query({
      data: page<MastodonStatus>([]),
      error: new MastodonActivityApiError(401, "auth", "upstream auth failure")
    });

    const { result } = renderHook(() => useMastodonActivitySurface(true));

    expect(result.current.activityError).toMatchObject({
      kind: "reconnect",
      message: "Session expired. Reconnect.",
      reconnectRequired: true
    });
  });

  it("reports loading activity only when account activity is enabled", () => {
    hookMocks.state.homeTimeline = query({ isLoading: true });

    const signedOut = renderHook(() => useMastodonActivitySurface(true));
    expect(signedOut.result.current.isLoadingActivity).toBe(false);

    hookMocks.state.session = query({ data: connectedSession() });
    const signedIn = renderHook(() => useMastodonActivitySurface(true));
    expect(signedIn.result.current.isLoadingActivity).toBe(true);
  });

  it("refreshes session and trends while signed out without fetching gated account activity", () => {
    const { result } = renderHook(() => useMastodonActivitySurface(true));

    result.current.refreshAll();

    expect(hookMocks.state.session.refetch).toHaveBeenCalledTimes(1);
    expect(hookMocks.state.trends.refetch).toHaveBeenCalledTimes(1);
    expect(hookMocks.state.homeTimeline.refetch).not.toHaveBeenCalled();
    expect(hookMocks.state.notifications.refetch).not.toHaveBeenCalled();
    expect(hookMocks.state.accountStatuses.refetch).not.toHaveBeenCalled();
  });

  it("refreshes all account activity when signed in", () => {
    hookMocks.state.session = query({ data: connectedSession() });
    const { result } = renderHook(() => useMastodonActivitySurface(true));

    result.current.refreshAll();

    expect(hookMocks.state.session.refetch).toHaveBeenCalledTimes(1);
    expect(hookMocks.state.homeTimeline.refetch).toHaveBeenCalledTimes(1);
    expect(hookMocks.state.notifications.refetch).toHaveBeenCalledTimes(1);
    expect(hookMocks.state.accountStatuses.refetch).toHaveBeenCalledTimes(1);
    expect(hookMocks.state.trends.refetch).toHaveBeenCalledTimes(1);
  });
});

function defaultHookState(): HookState {
  return {
    session: query({ data: { connected: false } }),
    homeTimeline: query({ data: page<MastodonStatus>([]) }),
    notifications: query({ data: page<MastodonNotification>([]) }),
    accountStatuses: query({ data: page<MastodonStatus>([]) }),
    trends: query({ data: [{ id: "trend-1", title: "Cozy fantasy", reason: "Warm reads", mentionCount: 3 }] })
  };
}

function query<T>(overrides: Partial<QueryMock<T>> = {}): QueryMock<T> {
  return {
    data: undefined,
    error: null,
    isLoading: false,
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
    scope: "profile read"
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
