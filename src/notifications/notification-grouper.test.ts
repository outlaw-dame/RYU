import { describe, expect, it } from "vitest";
import { groupNotifications } from "./notification-grouper";
import type { RawNotification } from "./types";

function makeNotification(overrides: Partial<RawNotification> & { id: string }): RawNotification {
  return {
    type: "favourite",
    created_at: "2024-01-15T10:00:00Z",
    account: { id: "acc-1", display_name: "Alice" },
    status: { id: "status-1", content: "Hello world", created_at: "2024-01-14T09:00:00Z" },
    ...overrides
  };
}

describe("groupNotifications", () => {
  it("returns empty array for empty input", () => {
    expect(groupNotifications([])).toEqual([]);
  });

  it("groups multiple favourites on the same status", () => {
    const notifications: RawNotification[] = [
      makeNotification({ id: "1", account: { id: "acc-1", display_name: "Alice" }, created_at: "2024-01-15T10:00:00Z" }),
      makeNotification({ id: "2", account: { id: "acc-2", display_name: "Bob" }, created_at: "2024-01-15T09:00:00Z" }),
      makeNotification({ id: "3", account: { id: "acc-3", display_name: "Carol" }, created_at: "2024-01-15T08:00:00Z" })
    ];

    const groups = groupNotifications(notifications);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe("favourite");
    expect(groups[0].accounts).toHaveLength(3);
    expect(groups[0].notificationIds).toEqual(["1", "2", "3"]);
    expect(groups[0].latestAt).toBe("2024-01-15T10:00:00Z");
  });

  it("does not group favourites on different statuses", () => {
    const notifications: RawNotification[] = [
      makeNotification({
        id: "1",
        account: { id: "acc-1", display_name: "Alice" },
        status: { id: "status-1", content: "First", created_at: "2024-01-14T09:00:00Z" }
      }),
      makeNotification({
        id: "2",
        account: { id: "acc-2", display_name: "Bob" },
        status: { id: "status-2", content: "Second", created_at: "2024-01-14T09:00:00Z" }
      })
    ];

    const groups = groupNotifications(notifications);
    expect(groups).toHaveLength(2);
  });

  it("groups consecutive follows", () => {
    const notifications: RawNotification[] = [
      makeNotification({ id: "1", type: "follow", account: { id: "acc-1", display_name: "Alice" }, status: undefined, created_at: "2024-01-15T10:00:00Z" }),
      makeNotification({ id: "2", type: "follow", account: { id: "acc-2", display_name: "Bob" }, status: undefined, created_at: "2024-01-15T09:00:00Z" }),
      makeNotification({ id: "3", type: "follow", account: { id: "acc-3", display_name: "Carol" }, status: undefined, created_at: "2024-01-15T08:00:00Z" })
    ];

    const groups = groupNotifications(notifications);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe("follow");
    expect(groups[0].accounts).toHaveLength(3);
  });

  it("does not group mentions (each is its own group)", () => {
    const notifications: RawNotification[] = [
      makeNotification({ id: "1", type: "mention", account: { id: "acc-1", display_name: "Alice" }, created_at: "2024-01-15T10:00:00Z" }),
      makeNotification({ id: "2", type: "mention", account: { id: "acc-2", display_name: "Bob" }, created_at: "2024-01-15T09:00:00Z" })
    ];

    const groups = groupNotifications(notifications);
    expect(groups).toHaveLength(2);
  });

  it("groups reblogs on same status", () => {
    const notifications: RawNotification[] = [
      makeNotification({ id: "1", type: "reblog", account: { id: "acc-1", display_name: "Alice" }, created_at: "2024-01-15T10:00:00Z" }),
      makeNotification({ id: "2", type: "reblog", account: { id: "acc-2", display_name: "Bob" }, created_at: "2024-01-15T09:00:00Z" })
    ];

    const groups = groupNotifications(notifications);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe("reblog");
    expect(groups[0].accounts).toHaveLength(2);
  });

  it("sorts groups by latestAt descending", () => {
    const notifications: RawNotification[] = [
      makeNotification({ id: "1", type: "mention", created_at: "2024-01-15T08:00:00Z" }),
      makeNotification({ id: "2", type: "follow", account: { id: "acc-2", display_name: "Bob" }, status: undefined, created_at: "2024-01-15T12:00:00Z" }),
      makeNotification({
        id: "3",
        type: "favourite",
        account: { id: "acc-3", display_name: "Carol" },
        status: { id: "status-99", content: "Latest", created_at: "2024-01-14T09:00:00Z" },
        created_at: "2024-01-15T10:00:00Z"
      })
    ];

    const groups = groupNotifications(notifications);
    expect(groups[0].latestAt).toBe("2024-01-15T12:00:00Z");
    expect(groups[1].latestAt).toBe("2024-01-15T10:00:00Z");
    expect(groups[2].latestAt).toBe("2024-01-15T08:00:00Z");
  });

  it("deduplicates accounts in a group", () => {
    const notifications: RawNotification[] = [
      makeNotification({ id: "1", account: { id: "acc-1", display_name: "Alice" }, created_at: "2024-01-15T10:00:00Z" }),
      makeNotification({ id: "2", account: { id: "acc-1", display_name: "Alice" }, created_at: "2024-01-15T09:00:00Z" })
    ];

    const groups = groupNotifications(notifications);
    expect(groups).toHaveLength(1);
    expect(groups[0].accounts).toHaveLength(1);
    expect(groups[0].notificationIds).toEqual(["1", "2"]);
  });
});
