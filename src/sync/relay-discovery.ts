import { z } from "zod";

/**
 * Polls relay.fedi.buzz for public ActivityPub activity and filters for book/reading/writing content.
 * No user account required—works entirely through public ActivityPub endpoints.
 */

export type RelayActivity = {
  id: string;
  type: "Create" | "Announce";
  actor: {
    id: string;
    preferredUsername: string;
    name?: string;
    icon?: { url: string };
  };
  object: {
    id: string;
    type: string;
    content: string;
    attributedTo: string;
    published: string;
    url?: string;
    inReplyTo?: string;
    tag?: Array<{ type: string; name?: string; href?: string }>;
    attachment?: Array<{ type: string; mediaType?: string; url?: string }>;
  };
  published: string;
};

export type RelayDiscoveryResult = {
  id: string;
  content: string;
  author: string;
  authorHandle: string;
  authorAvatar?: string;
  publishedAt: string;
  url?: string;
  hashtags: string[];
  mentions: string[];
  source: "relay.fedi.buzz";
};

// Book/reading/writing related keywords and hashtags
const BOOK_KEYWORDS = [
  "book",
  "reading",
  "writing",
  "author",
  "novel",
  "story",
  "fiction",
  "literature",
  "writer",
  "bookmark",
  "library",
  "read",
  "publish",
  "bookworm",
  "bibliophile",
  "isbn",
  "shelf",
  "poetry",
  "poetry",
];

const BOOK_HASHTAGS = [
  "books",
  "reading",
  "bookstagram",
  "bookblog",
  "bookworm",
  "bookish",
  "currentlyreading",
  "nowreading",
  "bookclub",
  "bookrecommendation",
  "booktwitter",
  "amreading",
  "writersofmastodon",
  "authorsofmastodon",
  "writerlife",
  "writingcommunity",
  "bookwyrm",
  "bookstodon",
  "writertodon",
  "fediverse",
  "mastodon",
  "amwriting",
  "writerswrite",
];

const RELAY_BUZZ_OUTBOX = "https://relay.fedi.buzz/outbox";
const RELAY_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ITEMS_PER_POLL = 50;
const CONTENT_RELEVANCE_THRESHOLD = 0.3;

function extractHashtags(content: string): string[] {
  const hashtagRegex = /#[\w]+/g;
  const matches = content.match(hashtagRegex) || [];
  return matches.map((tag) => tag.toLowerCase().slice(1));
}

function extractMentions(content: string): string[] {
  const mentionRegex = /@[\w@.]+/g;
  const matches = content.match(mentionRegex) || [];
  return matches.map((mention) => mention.toLowerCase());
}

function calculateRelevanceScore(activity: RelayActivity): number {
  const content = activity.object.content.toLowerCase();
  let score = 0;
  let matches = 0;

  // Check keywords
  for (const keyword of BOOK_KEYWORDS) {
    if (content.includes(keyword)) {
      score += 1;
      matches++;
    }
  }

  // Check hashtags in content
  const contentTags = extractHashtags(activity.object.content);
  for (const tag of contentTags) {
    if (BOOK_HASHTAGS.includes(tag)) {
      score += 2;
      matches++;
    }
  }

  // Check ActivityPub tags
  if (activity.object.tag) {
    for (const tag of activity.object.tag) {
      const tagName = (tag.name || "").toLowerCase();
      if (BOOK_HASHTAGS.includes(tagName)) {
        score += 2;
        matches++;
      }
    }
  }

  // Normalize by content length (avoid boosting very short posts)
  const normalizedScore = matches > 0 ? score / (content.length / 100 + 1) : 0;
  return normalizedScore;
}

function parseActivityPubCollection(response: any): RelayActivity[] {
  const items: RelayActivity[] = [];

  if (!response.orderedItems) {
    return items;
  }

  for (const item of response.orderedItems.slice(0, MAX_ITEMS_PER_POLL)) {
    try {
      if (item.type === "Create" || item.type === "Announce") {
        const activity: RelayActivity = {
          id: item.id || `relay:${Date.now()}:${Math.random()}`,
          type: item.type,
          actor: {
            id: item.actor?.id || "unknown",
            preferredUsername: item.actor?.preferredUsername || "unknown",
            name: item.actor?.name,
            icon: item.actor?.icon,
          },
          object: {
            id: item.object?.id || item.id || `relay:obj:${Math.random()}`,
            type: item.object?.type || "Note",
            content: item.object?.content || "",
            attributedTo: item.object?.attributedTo || item.actor?.id || "unknown",
            published: item.object?.published || item.published || new Date().toISOString(),
            url: item.object?.url || item.url,
            inReplyTo: item.object?.inReplyTo,
            tag: item.object?.tag,
            attachment: item.object?.attachment,
          },
          published: item.published || new Date().toISOString(),
        };
        items.push(activity);
      }
    } catch (e) {
      // Skip malformed items
      console.debug("Failed to parse ActivityPub item:", e);
    }
  }

  return items;
}

export async function pollRelayBuzz(): Promise<RelayDiscoveryResult[]> {
  try {
    const response = await fetch(RELAY_BUZZ_OUTBOX, {
      headers: {
        Accept: "application/activity+json",
      },
    });

    if (!response.ok) {
      throw new Error(`Relay poll failed: ${response.status}`);
    }

    const data = await response.json();
    const activities = parseActivityPubCollection(data);

    // Filter and score by relevance
    const results: RelayDiscoveryResult[] = [];

    for (const activity of activities) {
      const relevance = calculateRelevanceScore(activity);

      if (relevance >= CONTENT_RELEVANCE_THRESHOLD) {
        const hashtags = extractHashtags(activity.object.content);
        const mentions = extractMentions(activity.object.content);

        results.push({
          id: activity.object.id,
          content: activity.object.content,
          author: activity.actor.name || activity.actor.preferredUsername,
          authorHandle: `@${activity.actor.preferredUsername}@${new URL(activity.actor.id).hostname}`,
          authorAvatar: activity.actor.icon?.url,
          publishedAt: activity.object.published,
          url: activity.object.url,
          hashtags,
          mentions,
          source: "relay.fedi.buzz",
        });
      }
    }

    // Sort by recency
    results.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    return results;
  } catch (error) {
    console.error("Relay discovery poll error:", error);
    return [];
  }
}

/**
 * Convert RelayDiscoveryResult to a simplified MastodonStatus-like format
 * for integration with existing UI components
 */
export function relayResultToMastodonStatus(result: RelayDiscoveryResult) {
  return {
    id: result.id,
    content: result.content,
    account: {
      id: result.authorHandle,
      username: result.authorHandle,
      acct: result.authorHandle,
      display_name: result.author,
      avatar: result.authorAvatar,
      url: `https://${result.authorHandle.split("@")[2]}/`,
    },
    created_at: result.publishedAt,
    url: result.url,
    tags: result.hashtags.map((tag) => ({
      name: tag,
      url: `https://relay.fedi.buzz/tags/${tag}`,
    })),
    mentions: result.mentions.map((mention) => ({
      id: mention,
      username: mention,
      acct: mention,
      url: `https://relay.fedi.buzz/users/${mention}`,
    })),
    source: result.source,
  };
}

// Track last poll time to avoid hammering the relay
let lastPollTime = 0;

export async function getRelayDiscovery(): Promise<RelayDiscoveryResult[]> {
  const now = Date.now();

  // Enforce minimum poll interval
  if (now - lastPollTime < RELAY_POLL_INTERVAL_MS) {
    return [];
  }

  lastPollTime = now;
  return pollRelayBuzz();
}
