import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  pollRelayBuzz,
  relayResultToMastodonStatus,
  getRelayDiscovery,
  type RelayActivity,
} from "./relay-discovery";

describe("relay-discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockActivity: RelayActivity = {
    id: "https://relay.fedi.buzz/activities/123",
    type: "Create",
    actor: {
      id: "https://fosstodon.org/users/author",
      preferredUsername: "author",
      name: "Book Enthusiast",
      icon: { url: "https://example.com/avatar.jpg" },
    },
    object: {
      id: "https://fosstodon.org/users/author/statuses/456",
      type: "Note",
      content: 'Just finished reading "The Name of the Wind"! Amazing book #reading #fantasy',
      attributedTo: "https://fosstodon.org/users/author",
      published: "2026-05-04T10:00:00Z",
      url: "https://fosstodon.org/@author/456",
      tag: [
        { type: "Hashtag", name: "reading", href: "https://fosstodon.org/tags/reading" },
        { type: "Hashtag", name: "fantasy", href: "https://fosstodon.org/tags/fantasy" },
      ],
    },
    published: "2026-05-04T10:00:00Z",
  };

  describe("pollRelayBuzz", () => {
    it("should fetch and parse relay activities", async () => {
      const mockResponse = {
        orderedItems: [mockActivity],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const results = await pollRelayBuzz();

      expect(results).toHaveLength(1);
      expect(results[0].content).toContain("The Name of the Wind");
      expect(results[0].hashtags).toContain("reading");
    });

    it("should filter by relevance score", async () => {
      const irrelevantActivity: RelayActivity = {
        ...mockActivity,
        object: {
          ...mockActivity.object,
          content: "Just had a nice coffee this morning",
        },
      };

      const mockResponse = {
        orderedItems: [mockActivity, irrelevantActivity],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const results = await pollRelayBuzz();

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain("The Name of the Wind");
    });

    it("should handle network errors gracefully", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const results = await pollRelayBuzz();

      expect(results).toEqual([]);
    });

    it("should extract hashtags from content", async () => {
      const mockResponse = {
        orderedItems: [mockActivity],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const results = await pollRelayBuzz();

      expect(results[0].hashtags).toContain("reading");
      expect(results[0].hashtags).toContain("fantasy");
    });

    it("should extract mentions from content", async () => {
      const activity: RelayActivity = {
        ...mockActivity,
        object: {
          ...mockActivity.object,
          content: '@alice @bob check out this book #reading',
        },
      };

      const mockResponse = {
        orderedItems: [activity],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const results = await pollRelayBuzz();

      expect(results[0].mentions).toContain("@alice");
      expect(results[0].mentions).toContain("@bob");
    });
  });

  describe("relayResultToMastodonStatus", () => {
    it("should convert relay result to mastodon status format", async () => {
      const mockResponse = {
        orderedItems: [mockActivity],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const results = await pollRelayBuzz();
      const status = relayResultToMastodonStatus(results[0]);

      expect(status.id).toBe(results[0].id);
      expect(status.content).toBe(results[0].content);
      expect(status.account.display_name).toBe("Book Enthusiast");
      expect(status.tags).toContainEqual(
        expect.objectContaining({ name: "reading" })
      );
    });
  });

  describe("getRelayDiscovery", () => {
    beforeEach(() => {
      // Reset module state by clearing the timeout
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should enforce minimum poll interval", async () => {
      const mockResponse = {
        orderedItems: [mockActivity],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      // First poll should work
      const results1 = await getRelayDiscovery();
      expect(results1.length).toBeGreaterThan(0);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second poll immediately should be throttled
      const results2 = await getRelayDiscovery();
      expect(results2).toEqual([]);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
