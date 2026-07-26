import { describe, expect, it } from "vitest";
import type { MastodonNotification } from "../sync/mastodon-client";
import {
  notificationToModeratableStatus,
  visibleNotifications
} from "./activity-policy-adapter";

function notification(): MastodonNotification {
  return {
    id: "notification-1",
    type: "mention",
    created_at: "2026-01-01T00:00:00.000Z",
    account: {
      id: "actor-1",
      acct: "actor@books.example",
      display_name: "Actor"
    },
    status: {
      id: "status-1",
      created_at: "2026-01-01T00:00:00.000Z",
      account: { id: "status-author" },
      content: "<p>spoiler</p>",
      sensitive: true,
      spoiler_text: "CW",
      reblog: null
    }
  };
}

describe("activity policy adapter", () => {
  it("preserves the notification while exposing its actor and status content", () => {
    const source = notification();
    const input = notificationToModeratableStatus(source);

    expect(input.notification).toBe(source);
    expect(input.account.id).toBe("actor-1");
    expect(input.content).toBe("<p>spoiler</p>");
    expect(input.sensitive).toBe(true);
    expect(input.spoiler_text).toBe("CW");
  });

  it("removes hard-hidden notifications without erasing intervention decisions", () => {
    const input = notificationToModeratableStatus(notification());
    const visible = visibleNotifications([
      {
        item: input,
        decision: {
          action: "warn",
          reasons: ["keyword"],
          matchedFilters: [],
          safetyLabels: []
        },
        hidden: false,
        requiresIntervention: true
      },
      {
        item: { ...input, notification: { ...input.notification, id: "hidden" } },
        decision: {
          action: "hide",
          reasons: ["blocked"],
          matchedFilters: [],
          safetyLabels: []
        },
        hidden: true,
        requiresIntervention: true
      }
    ]);

    expect(visible).toHaveLength(1);
    expect(visible[0].notification.id).toBe("notification-1");
    expect(visible[0].decision.action).toBe("warn");
  });
});
