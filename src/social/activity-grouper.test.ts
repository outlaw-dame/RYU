import { describe, it, expect } from "vitest";
import { groupActivities, getUngroupedActivities } from "./activity-grouper";
import type { BookActivity } from "./types";
import type { MastodonStatus } from "../sync/mastodon-client";

function makeActivity(
  overrides: Partial<BookActivity> & { id?: string; createdAt?: string } = {}
): BookActivity {
  const { id = "1", createdAt = "2024-01-01T12:00:00Z", ...rest } = overrides;
  return {
    status: {
      id,
      created_at: createdAt,
      account: { id: "acc1", acct: "reader@example.social", display_name: "Reader" },
      content: "",
      visibility: "public"
    } as MastodonStatus,
    activityType: "discussion",
    isBookRelated: true,
    bookReferences: [],
    relevantHashtags: [],
    confidence: 0.7,
    ...rest
  };
}

describe("activity-grouper", () => {
  describe("groupActivities", () => {
    it("groups activities by book reference", () => {
      const activities: BookActivity[] = [
        makeActivity({ id: "1", bookReferences: ["project hail mary"], createdAt: "2024-01-02T12:00:00Z" }),
        makeActivity({ id: "2", bookReferences: ["project hail mary"], createdAt: "2024-01-01T12:00:00Z" }),
        makeActivity({ id: "3", bookReferences: ["the midnight library"], createdAt: "2024-01-01T10:00:00Z" })
      ];

      const groups = groupActivities(activities);
      expect(groups).toHaveLength(2);
      expect(groups[0].activities).toHaveLength(2);
      expect(groups[1].activities).toHaveLength(1);
    });

    it("groups activities by hashtag when no book reference", () => {
      const activities: BookActivity[] = [
        makeActivity({ id: "1", relevantHashtags: ["fantasy", "bookstodon"], createdAt: "2024-01-02T12:00:00Z" }),
        makeActivity({ id: "2", relevantHashtags: ["fantasy", "bookstodon"], createdAt: "2024-01-01T12:00:00Z" })
      ];

      const groups = groupActivities(activities);
      expect(groups).toHaveLength(1);
      expect(groups[0].activities).toHaveLength(2);
    });

    it("sorts groups by most recent activity", () => {
      const activities: BookActivity[] = [
        makeActivity({ id: "1", bookReferences: ["old book"], createdAt: "2024-01-01T12:00:00Z" }),
        makeActivity({ id: "2", bookReferences: ["new book"], createdAt: "2024-01-03T12:00:00Z" })
      ];

      const groups = groupActivities(activities);
      expect(groups[0].label.toLowerCase()).toContain("new book");
    });

    it("counts unique authors in a group", () => {
      const activities: BookActivity[] = [
        makeActivity({ id: "1", bookReferences: ["the book"], createdAt: "2024-01-01T12:00:00Z" }),
        {
          ...makeActivity({ id: "2", bookReferences: ["the book"], createdAt: "2024-01-02T12:00:00Z" }),
          status: {
            id: "2",
            created_at: "2024-01-02T12:00:00Z",
            account: { id: "acc2", acct: "other@example.social", display_name: "Other" },
            content: "",
            visibility: "public"
          } as MastodonStatus
        }
      ];

      const groups = groupActivities(activities);
      expect(groups[0].authorCount).toBe(2);
    });

    it("skips non-book-related activities", () => {
      const activities: BookActivity[] = [
        makeActivity({ id: "1", isBookRelated: false }),
        makeActivity({ id: "2", bookReferences: ["a book"], isBookRelated: true })
      ];

      const groups = groupActivities(activities);
      expect(groups).toHaveLength(1);
    });

    it("handles empty input", () => {
      const groups = groupActivities([]);
      expect(groups).toHaveLength(0);
    });

    it("merges similar group keys (substring match)", () => {
      const activities: BookActivity[] = [
        makeActivity({ id: "1", bookReferences: ["project hail mary"], createdAt: "2024-01-01T12:00:00Z" }),
        makeActivity({ id: "2", bookReferences: ["hail mary"], createdAt: "2024-01-02T12:00:00Z" })
      ];

      const groups = groupActivities(activities);
      expect(groups).toHaveLength(1);
      expect(groups[0].activities).toHaveLength(2);
    });
  });

  describe("getUngroupedActivities", () => {
    it("returns non-book-related activities", () => {
      const activities: BookActivity[] = [
        makeActivity({ id: "1", isBookRelated: true }),
        makeActivity({ id: "2", isBookRelated: false }),
        makeActivity({ id: "3", isBookRelated: false })
      ];

      const ungrouped = getUngroupedActivities(activities);
      expect(ungrouped).toHaveLength(2);
      expect(ungrouped.every((a) => !a.isBookRelated)).toBe(true);
    });

    it("returns empty array when all activities are book-related", () => {
      const activities: BookActivity[] = [
        makeActivity({ id: "1", isBookRelated: true }),
        makeActivity({ id: "2", isBookRelated: true })
      ];

      const ungrouped = getUngroupedActivities(activities);
      expect(ungrouped).toHaveLength(0);
    });
  });
});
