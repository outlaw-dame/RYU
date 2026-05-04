import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  pollRelayBuzz,
  relayResultToMastodonStatus,
  getRelayDiscovery,
  matchEntitiesInContent,
  _resetRelayThrottleForTests,
  type RelayActivity,
  type RelayEntity,
} from "./relay-discovery";

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

function mockFetchOnce(items: RelayActivity[]) {
  const fetchImpl = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ orderedItems: items }),
  });
  return fetchImpl as unknown as typeof fetch;
}

describe("relay-discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetRelayThrottleForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("pollRelayBuzz", () => {
    it("should fetch and parse relay activities", async () => {
      const results = await pollRelayBuzz({ fetchImpl: mockFetchOnce([mockActivity]) });
      expect(results).toHaveLength(1);
      expect(results[0].content).toContain("The Name of the Wind");
      expect(results[0].hashtags).toContain("reading");
    });

    it("should filter by relevance score", async () => {
      const irrelevant: RelayActivity = {
        ...mockActivity,
        id: "https://relay.fedi.buzz/activities/999",
        object: {
          ...mockActivity.object,
          id: "https://fosstodon.org/users/author/statuses/999",
          content: "Just had a nice coffee this morning",
          tag: undefined,
        },
      };
      const results = await pollRelayBuzz({ fetchImpl: mockFetchOnce([mockActivity, irrelevant]) });
      expect(results.length).toBe(1);
      expect(results[0].content).toContain("The Name of the Wind");
    });

    it("should handle network errors gracefully", async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new Error("Network error")) as unknown as typeof fetch;
      const results = await pollRelayBuzz({ fetchImpl });
      expect(results).toEqual([]);
    });

    it("should handle non-ok responses gracefully", async () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
      const results = await pollRelayBuzz({ fetchImpl });
      expect(results).toEqual([]);
    });

    it("should extract hashtags and strip HTML from content", async () => {
      const htmlActivity: RelayActivity = {
        ...mockActivity,
        object: {
          ...mockActivity.object,
          content: '<p>Loving this novel <a href="#">#bookstodon</a> #reading</p>',
        },
      };
      const results = await pollRelayBuzz({ fetchImpl: mockFetchOnce([htmlActivity]) });
      expect(results[0].hashtags).toEqual(expect.arrayContaining(["bookstodon", "reading"]));
    });

    it("should extract mentions from content", async () => {
      const activity: RelayActivity = {
        ...mockActivity,
        object: { ...mockActivity.object, content: "@alice @bob check out this book #reading" },
      };
      const results = await pollRelayBuzz({ fetchImpl: mockFetchOnce([activity]) });
      expect(results[0].mentions).toEqual(expect.arrayContaining(["@alice", "@bob"]));
    });

    it("should tolerate malformed actor URLs without throwing", async () => {
      const broken: RelayActivity = {
        ...mockActivity,
        actor: { ...mockActivity.actor, id: "not-a-url" },
      };
      const results = await pollRelayBuzz({ fetchImpl: mockFetchOnce([broken]) });
      expect(results).toHaveLength(1);
      expect(results[0].authorHandle).toBe("@author@unknown");
    });
  });

  describe("entity-aware matching", () => {
    const entities: RelayEntity[] = [
      { id: "author-stephen-king", type: "author", label: "Stephen King", aliases: ["stephen king"] },
      { id: "book-the-stand", type: "book", label: "The Stand", aliases: ["the stand"] },
      { id: "comic-saga", type: "comic", label: "Saga", aliases: ["saga"] },
    ];

    it("matches entities by author name with no hashtags present", () => {
      const matches = matchEntitiesInContent(
        "Just picked up a new Stephen King paperback at the store",
        entities
      );
      expect(matches.map((m) => m.id)).toContain("author-stephen-king");
    });

    it("matches book titles in plain prose", () => {
      const matches = matchEntitiesInContent("Re-reading The Stand for the third time", entities);
      expect(matches.map((m) => m.id)).toContain("book-the-stand");
    });

    it("uses word boundaries to avoid false positives", () => {
      // "saga" should NOT match inside "sagas" if we required exact… but our word-boundary regex
      // does treat the trailing 's' as a non-word char terminator, so we use a non-bordering word
      const noMatch = matchEntitiesInContent("This passage is about navigation", entities);
      expect(noMatch).toEqual([]);
    });

    it("rescues posts that mention an entity but lack book hashtags or keywords", async () => {
      const offTopic: RelayActivity = {
        ...mockActivity,
        id: "https://relay.fedi.buzz/activities/777",
        object: {
          ...mockActivity.object,
          id: "https://fosstodon.org/users/author/statuses/777",
          content: "Saw Stephen King at a coffee shop today, what a coincidence",
          tag: undefined,
        },
      };
      const results = await pollRelayBuzz({
        fetchImpl: mockFetchOnce([offTopic]),
        entities,
      });
      expect(results).toHaveLength(1);
      expect(results[0].matchedEntities[0].label).toBe("Stephen King");
    });

    it("ranks entity-matched posts ahead of keyword-only posts", async () => {
      const entityHit: RelayActivity = {
        ...mockActivity,
        id: "https://relay.fedi.buzz/activities/aaa",
        object: {
          ...mockActivity.object,
          id: "https://fosstodon.org/users/author/statuses/aaa",
          content: "Reading The Stand again",
          tag: undefined,
        },
      };
      const keywordOnly: RelayActivity = {
        ...mockActivity,
        id: "https://relay.fedi.buzz/activities/bbb",
        object: {
          ...mockActivity.object,
          id: "https://fosstodon.org/users/author/statuses/bbb",
          content: "Love reading novels and writing fiction #bookstodon",
          tag: undefined,
        },
      };
      const results = await pollRelayBuzz({
        fetchImpl: mockFetchOnce([keywordOnly, entityHit]),
        entities,
      });
      expect(results[0].id).toBe(entityHit.object.id);
    });

    it("boosts posts matching the active search query", async () => {
      const queryHit: RelayActivity = {
        ...mockActivity,
        id: "https://relay.fedi.buzz/activities/qqq",
        object: {
          ...mockActivity.object,
          id: "https://fosstodon.org/users/author/statuses/qqq",
          content: "Loving the new Brandon Sanderson novel #bookstodon",
          tag: undefined,
        },
      };
      const generic: RelayActivity = {
        ...mockActivity,
        id: "https://relay.fedi.buzz/activities/ggg",
        object: {
          ...mockActivity.object,
          id: "https://fosstodon.org/users/author/statuses/ggg",
          content: "A nice book about reading and writing #reading",
          tag: undefined,
        },
      };
      const results = await pollRelayBuzz({
        fetchImpl: mockFetchOnce([generic, queryHit]),
        query: "brandon sanderson",
      });
      expect(results[0].id).toBe(queryHit.object.id);
    });
  });

  describe("relayResultToMastodonStatus", () => {
    it("should convert relay result to mastodon status format", async () => {
      const results = await pollRelayBuzz({ fetchImpl: mockFetchOnce([mockActivity]) });
      const status = relayResultToMastodonStatus(results[0]);
      expect(status.id).toBe(results[0].id);
      expect(status.content).toBe(results[0].content);
      expect(status.account.display_name).toBe("Book Enthusiast");
      expect(status.account.url).toBe("https://fosstodon.org/");
      expect(status.tags).toContainEqual(expect.objectContaining({ name: "reading" }));
    });
  });

  describe("getRelayDiscovery", () => {
    it("should enforce minimum poll interval", async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ orderedItems: [mockActivity] }),
      }) as unknown as typeof fetch;

      const results1 = await getRelayDiscovery({ fetchImpl });
      expect(results1.length).toBeGreaterThan(0);
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      const results2 = await getRelayDiscovery({ fetchImpl });
      expect(results2).toEqual([]);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
  });
});
