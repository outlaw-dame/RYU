import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("../sync/use-mastodon-activity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../sync/use-mastodon-activity")>();
  return {
    ...actual,
    useBookTokTrends: () => hookMocks.state.trends,
    useDisconnectMastodon: () => hookMocks.state.disconnect,
    useMastodonAccountStatuses: () => hookMocks.state.accountStatuses,
    useMastodonHomeTimeline: () => hookMocks.state.homeTimeline,
    useMastodonNotifications: () => hookMocks.state.notifications,
    useMastodonSession: () => hookMocks.state.session
  };
});

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
      error: new MastodonActivityApiError(401, "auth", "upstream auth failure")
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
      error: new MastodonActivityApiError(429, "rate_limited", "too many requests")
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

  it("shows Disconnecting… label while disconnect is pending", () => {
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.state.disconnect = { mutateAsync: hookMocks.disconnectMutateAsync, isPending: true };

    render(<MastodonActivityPanel onConnect={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Disconnecting…" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnecting…" })).toBeDisabled();
  });

  it("renders the loading skeleton when session is loading", () => {
    hookMocks.state.session = query({ isLoading: true, isPending: true });

    render(<MastodonActivityPanel onConnect={vi.fn()} />);

    expect(screen.getByLabelText("Loading activity")).toBeInTheDocument();
  });

  it("renders the BookTok trend rail with trends", () => {
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.state.trends = query({
      data: [
        { id: "t1", title: "Iron Flame", author: "Rebecca Yarros", reason: "Romantasy surge", mentionCount: 42 },
        { id: "t2", title: "Fourth Wing", author: "Rebecca Yarros", reason: "Series continuation", mentionCount: 31 }
      ]
    });

    render(<MastodonActivityPanel onConnect={vi.fn()} />);

    expect(screen.getByText("BookTok signals")).toBeInTheDocument();
    expect(screen.getByText("Iron Flame")).toBeInTheDocument();
    expect(screen.getByText("Fourth Wing")).toBeInTheDocument();
    expect(screen.getByText("42 mentions")).toBeInTheDocument();
  });

  it("renders loading activity skeleton cards when activity is loading", () => {
    hookMocks.state.session = query({ data: connectedSession() });
    hookMocks.state.homeTimeline = query({ isLoading: true, isPending: true });

    render(<MastodonActivityPanel onConnect={vi.fn()} />);

    expect(screen.getByLabelText("Loading account activity")).toBeInTheDocument();
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
