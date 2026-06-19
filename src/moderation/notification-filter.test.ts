import { describe, expect, it } from "vitest";
import { evaluateNotification, filterNotifications } from "./notification-filter";
import type { NotificationInput } from "./notification-filter";
import type { PolicyAccount, PolicyRelationship } from "./policy-types";

function makeBlockedAccount(accountId: string): PolicyAccount {
  return {
    id: `block-${accountId}`,
    accountId,
    action: "block",
    hideNotifications: true,
    expiresAt: null,
    source: "local",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  };
}

function makeRelationship(accountId: string, following: boolean): PolicyRelationship {
  return {
    id: `rel-${accountId}`,
    accountId,
    following,
    followedBy: false,
    blocking: false,
    blockedBy: false,
    muting: false,
    mutingNotifications: false,
    requested: false,
    requestedBy: false,
    domainBlocking: false,
    endorsed: false,
    mutingExpiresAt: null,
    instanceOrigin: "https://instance.tld",
    ownerAccountId: "me",
    syncedAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  };
}

describe("notification-filter", () => {
  describe("evaluateNotification", () => {
    it("blocks notifications from blocked accounts", () => {
      const input: NotificationInput = {
        type: "favourite",
        accountId: "spammer-1"
      };
      const result = evaluateNotification(input, [makeBlockedAccount("spammer-1")], []);
      expect(result.trustLevel).toBe("blocked");
      expect(result.showInMainFeed).toBe(false);
    });

    it("trusts notifications from followed accounts", () => {
      const input: NotificationInput = {
        type: "mention",
        accountId: "friend-1",
        isFollowing: true
      };
      const result = evaluateNotification(input, [], []);
      expect(result.trustLevel).toBe("trusted");
      expect(result.showInMainFeed).toBe(true);
    });

    it("trusts notifications from followed accounts via relationship", () => {
      const input: NotificationInput = {
        type: "mention",
        accountId: "friend-1"
      };
      const result = evaluateNotification(
        input,
        [],
        [makeRelationship("friend-1", true)]
      );
      expect(result.trustLevel).toBe("trusted");
      expect(result.showInMainFeed).toBe(true);
    });

    it("flags new accounts", () => {
      const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const input: NotificationInput = {
        type: "follow",
        accountId: "new-user",
        accountCreatedAt: recentDate
      };
      const result = evaluateNotification(input, [], []);
      expect(result.categories).toContain("new_account");
    });

    it("flags private mentions from non-followed accounts", () => {
      const input: NotificationInput = {
        type: "mention",
        accountId: "stranger",
        visibility: "direct"
      };
      const result = evaluateNotification(input, [], []);
      expect(result.categories).toContain("private_mention");
    });

    it("flags mass mentions", () => {
      const input: NotificationInput = {
        type: "mention",
        accountId: "spammer",
        mentionCount: 15
      };
      const result = evaluateNotification(input, [], []);
      expect(result.categories).toContain("mass_mention");
      expect(result.trustLevel).toBe("suspicious");
      expect(result.quarantine).toBe(true);
    });

    it("flags suspicious links", () => {
      const input: NotificationInput = {
        type: "mention",
        accountId: "scammer",
        content: "Click here to claim your free crypto at bit.ly/scam"
      };
      const result = evaluateNotification(input, [], []);
      expect(result.categories).toContain("suspicious_link");
    });

    it("quarantines notifications with multiple red flags", () => {
      const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
      const input: NotificationInput = {
        type: "mention",
        accountId: "sketchy",
        accountCreatedAt: recentDate,
        visibility: "direct"
      };
      const result = evaluateNotification(input, [], []);
      expect(result.trustLevel).toBe("suspicious");
      expect(result.quarantine).toBe(true);
      expect(result.showInMainFeed).toBe(false);
    });

    it("passes normal notifications from unknown accounts", () => {
      const input: NotificationInput = {
        type: "favourite",
        accountId: "normal-user",
        accountCreatedAt: "2023-01-01T00:00:00Z"
      };
      const result = evaluateNotification(input, [], []);
      expect(result.trustLevel).toBe("normal");
      expect(result.showInMainFeed).toBe(true);
    });
  });

  describe("filterNotifications", () => {
    it("separates main and quarantine notifications", () => {
      const notifications = [
        { accountId: "friend", type: "favourite" },
        { accountId: "spammer", type: "mention" },
        { accountId: "normal", type: "follow" }
      ];

      const { main, quarantine } = filterNotifications(notifications, (n) => {
        if (n.accountId === "spammer") {
          return {
            trustLevel: "suspicious",
            categories: ["mass_mention"],
            showInMainFeed: false,
            quarantine: true,
            reasons: ["Mass mention"]
          };
        }
        return {
          trustLevel: "normal",
          categories: [],
          showInMainFeed: true,
          quarantine: false,
          reasons: []
        };
      });

      expect(main).toHaveLength(2);
      expect(quarantine).toHaveLength(1);
      expect(quarantine[0].accountId).toBe("spammer");
    });
  });
});
