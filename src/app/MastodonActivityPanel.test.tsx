import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookTokTrend } from "../sync/booktok-trending";
import type { MastodonNotification, MastodonPage, MastodonStatus } from "../sync/mastodon-client";
import type { MastodonSessionState } from "../sync/mastodon-activity-api";

type QueryMock<T> = {
  data?: T;
  error: Error | null;
  isLoading: boolean;
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
  accountStatuses: QueryMock<MastodonPage<MastodonStatus>>;
  trends: QueryMock<BookTokTrend[]>;
  disconnect: MutationMock;
};

const hookMocks = vi.hoisted(() => ({
  state: {} as HookState,
  disconnectMutateAsync: vi.fn()
}));

vi.mock("../sync/use-mastodon-activity", () => ({
  getMastodonActivityErrorState: (error: unknown) => {
    if (!error) return null;

    const activityError = error as { status?: number; isAuthError?: boolean; isRateLimited?: boolean; retryAfterMs?: number };
    if (activityError.isAuthError || activityError.status === 401 || activityError.status === 403) {
      return { kind: "reconnect", message: "Session expired. Reconnect.", reconnectRequired: true };
    }
    if (activityError.isRateLimited || activityError.status === 429) {
      return {
        kind: "rate-limited",
        message: "Activity is temporarily rate limited. Try again shortly.",
        reconnectRequired: false,
        retryAfterMs: activityError.retryAfterMs
      };
    }

    return { kind: "refresh-failed", message: "Couldn’t refresh activity. Try again.", reconnectRequired: false };
  },
  useBookTokTrends: () => hookMocks.state.trends,
  useDisconnectMastodon: () => hookMocks.state.disconnect,
  useMastodonAccountStatuses: () => hookMocks.state.accountStatuses,
  useMastodonHomeTimeline: () => hookMocks.state.homeTimeline,
  useMastodonNotifications: () => hookMocks.state.notifications,
  useMastodonSession: () => hookMocks.state.session
}));

import { MastodonActivityPanel } from "./MastodonActivityPanel";

beforeEach(() => {
  hookMocks.disconnectMutateAsync.mockReset();
  hookMocks.disconnectMutateAsync.mockResolvedValue(undefined);
  hookMocks.state = defaultHookState();
});

afterEach(() => {
  cleanup();
});

describe("MastodonActivityPanel", () => {
  it("renders the connect prompt when signed out", () => {
    const onConnect = vi.fn();

    render(<MastodonActivityPanel onConnect={onConnect} />);

    expect(screen.getByText("Connect your account")).toBeInTheDocument();
    expect(screen.getByText("Bring in your reading timeline, replies, and notifications without turning RYU into a generic social feed.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Connect account" }));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it("renders mocked timeline statuses when signed in", () => {
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.state.homeTimeline = query({ data: page([statusPayload("41", "Reading Dune tonight")]) });

    render(<MastodonActivityPanel onConnect={vi.fn()} />);

    expect(screen.getByText("Connected as reader@social.example")).toBeInTheDocument();
    expect(screen.getByText("Home timeline")).toBeInTheDocument();
    expect(screen.getByText("Reading Dune tonight")).toBeInTheDocument();
  });

  it("renders mocked notifications when signed in", () => {
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.state.notifications = query({ data: page([
      notificationPayload("51", "favourite", statusPayload("42", "Loved this review"))
    ]) });

    render(<MastodonActivityPanel onConnect={vi.fn()} />);

    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(screen.getByText("reader2@social.example favourited your post")).toBeInTheDocument();
    expect(screen.getByText("Loved this review")).toBeInTheDocument();
  });

  it("renders the empty state when signed in activity is empty", () => {
    hookMocks.state.session = query({ data: connectedSession() });

    render(<MastodonActivityPanel onConnect={vi.fn()} />);

    expect(screen.getByText("Nothing new yet")).toBeInTheDocument();
    expect(screen.getByText("When your reading network has new posts or notifications, they’ll appear here.")).toBeInTheDocument();
  });

  it("renders reconnect state for 401/403 activity errors", () => {
    const onReconnect = vi.fn();
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.state.homeTimeline = query({
      data: page<MastodonStatus>([]),
      error: Object.assign(new Error("upstream auth failure"), { status: 401, isAuthError: true })
    });

    render(<MastodonActivityPanel onConnect={vi.fn()} onReconnect={onReconnect} />);

    expect(screen.getByText("Session expired. Reconnect.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it("renders rate-limit state for 429 activity errors", () => {
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.state.homeTimeline = query({
      data: page<MastodonStatus>([]),
      error: Object.assign(new Error("too many requests"), { status: 429, isRateLimited: true })
    });

    render(<MastodonActivityPanel onConnect={vi.fn()} />);

    expect(screen.getByText("Activity is temporarily rate limited. Try again shortly.")).toBeInTheDocument();
  });

  it("renders a safe refresh error for network failures", () => {
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.state.homeTimeline = query({
      data: page<MastodonStatus>([]),
      error: new Error("ECONNRESET internal detail should not render")
    });

    render(<MastodonActivityPanel onConnect={vi.fn()} />);

    expect(screen.getByText("Couldn’t refresh activity. Try again.")).toBeInTheDocument();
    expect(screen.queryByText(/ECONNRESET/)).not.toBeInTheDocument();
  });

  it("calls the disconnect mutation from the UI", () => {
    hookMocks.state.session = query({ data: connectedSession() });

    render(<MastodonActivityPanel onConnect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(hookMocks.disconnectMutateAsync).toHaveBeenCalledTimes(1);
  });
});

function defaultHookState(): HookState {
  return {
    session: query({ data: { connected: false } }),
    homeTimeline: query({ data: page<MastodonStatus>([]) }),
    notifications: query({ data: page<MastodonNotification>([]) }),
    accountStatuses: query({ data: page<MastodonStatus>([]) }),
    trends: query({ data: [{ id: "trend-1", title: "Cozy fantasy", reason: "Warm reads", mentionCount: 3 }] }),
    disconnect: { mutateAsync: hookMocks.disconnectMutateAsync, isPending: false }
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

function accountPayload(id: string, acct = `reader${id}@social.example`) {
  return { id, username: `reader${id}`, acct };
}

function statusPayload(id: string, content: string): MastodonStatus {
  return {
    id,
    uri: `https://social.example/users/reader/statuses/${id}`,
    url: `https://social.example/@reader/${id}`,
    created_at: "2026-04-29T00:00:00.000Z",
    content: `<p>${content}</p>`,
    account: accountPayload("1", "reader@social.example")
  } as MastodonStatus;
}

function notificationPayload(id: string, type: string, status: MastodonStatus): MastodonNotification {
  return {
    id,
    type,
    created_at: "2026-04-29T00:00:00.000Z",
    account: accountPayload("2"),
    status
  } as MastodonNotification;
}
