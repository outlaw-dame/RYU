/**
 * Polls relay.fedi.buzz for public ActivityPub activity and filters for book/reading/writing content.
 * No user account required—works entirely through public ActivityPub endpoints.
 *
 * Recognizes entities (authors, books, comics) in post content even when no hashtag is present,
 * by matching against a caller-supplied entity catalog (typically built from the local RxDB store
 * plus the static discovery catalog).
 */

function splitCamelCase(value: string): string {
  return value
    .replace(/^#/, "")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z\d]+)/g, "$1 $2")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

export type RelayEntityType = "author" | "work" | "edition" | "book" | "comic" | "publisher" | "keyword";

export type RelayEntity = {
  id: string;
  type: RelayEntityType;
  label: string;
  /** Normalized aliases (lowercase, trimmed). Each alias is matched as a whole-token substring. */
  aliases: string[];
};

export type RelayEntityMatch = {
  id: string;
  type: RelayEntityType;
  label: string;
  matchedAlias: string;
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
  /** Entities (authors, books, comics, etc.) detected in the post body. */
  matchedEntities: RelayEntityMatch[];
  /** Final relevance score used for ranking. */
  relevance: number;
  source: "relay.fedi.buzz";
};

export type RelayDiscoveryOptions = {
  /** Caller-provided catalog: db authors/works/editions plus discovery seeds. */
  entities?: RelayEntity[];
  /** Active user search query. Posts matching the query are boosted; others remain admissible. */
  query?: string;
  /** Override fetch implementation (tests). */
  fetchImpl?: typeof fetch;
  /** Override outbox URL (tests). */
  outboxUrl?: string;
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
  "comic",
  "manga",
  "graphic novel",
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
  "amwriting",
  "writerswrite",
  "comics",
  "comic",
  "manga",
  "graphicnovel",
  "graphicnovels",
  "manhua",
  "manhwa",
  "comicbook",
  "comicbooks",
];

const RELAY_BUZZ_OUTBOX = "https://relay.fedi.buzz/outbox";
const RELAY_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ITEMS_PER_POLL = 50;
const CONTENT_RELEVANCE_THRESHOLD = 0.3;
const ENTITY_MATCH_BOOST = 5; // an entity hit alone clears the threshold
const QUERY_MATCH_BOOST = 3;

function stripHtmlForScan(html: string): string {
  return html
    .replace(/<br\s*\/?>(\s*)/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHashtags(content: string): string[] {
  const hashtagRegex = /#[\w]+/g;
  const matches = content.match(hashtagRegex) || [];
  return Array.from(new Set(matches.map((tag) => tag.toLowerCase().slice(1))));
}

function extractMentions(content: string): string[] {
  const mentionRegex = /@[\w][\w.\-]*(?:@[\w.\-]+)?/g;
  const matches = content.match(mentionRegex) || [];
  return Array.from(new Set(matches.map((mention) => mention.toLowerCase())));
}

/**
 * Word-boundary-aware substring match. Avoids false positives like
 * matching "art" inside "Bart" or "harry" inside "harrying".
 */
function containsAlias(haystack: string, alias: string): boolean {
  if (!alias) return false;
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Use word boundary on each side; allow alias to contain spaces.
  const regex = new RegExp(`(?:^|\\W)${escaped}(?:\\W|$)`, "i");
  return regex.test(haystack);
}

/**
 * Append camelCase-split forms of any hashtags in `text` to the text itself.
 * Lets queries like "Mitch Albom" match posts that only carry `#MitchAlbom`,
 * and vice versa. Operates on case-preserved text (must run before lowercasing).
 */
function expandHashtagSplits(text: string): string {
  if (!text) return text;
  const parts: string[] = [text];
  const seen = new Set<string>();
  const matches = text.match(/#[A-Za-z0-9_]+/g) ?? [];
  for (const tag of matches) {
    const split = splitCamelCase(tag);
    if (split && split.includes(" ") && !seen.has(split.toLowerCase())) {
      seen.add(split.toLowerCase());
      parts.push(split);
    }
  }
  return parts.join(" ");
}

export function matchEntitiesInContent(plainContent: string, entities: RelayEntity[] | undefined): RelayEntityMatch[] {
  if (!entities || entities.length === 0 || !plainContent) return [];
  const seen = new Set<string>();
  const matches: RelayEntityMatch[] = [];
  const lower = expandHashtagSplits(plainContent).toLowerCase();

  for (const entity of entities) {
    if (seen.has(entity.id)) continue;
    for (const aliasRaw of entity.aliases) {
      const alias = (aliasRaw || "").trim().toLowerCase();
      if (alias.length < 3) continue; // avoid noisy 1-2 char tokens
      if (containsAlias(lower, alias)) {
        matches.push({ id: entity.id, type: entity.type, label: entity.label, matchedAlias: alias });
        seen.add(entity.id);
        break;
      }
    }
  }

  return matches;
}

function calculateRelevanceScore(
  activity: RelayActivity,
  plainContent: string,
  options: { entities?: RelayEntity[]; query?: string } = {}
): { score: number; entityMatches: RelayEntityMatch[] } {
  const lowered = expandHashtagSplits(plainContent).toLowerCase();
  let score = 0;
  let matches = 0;

  for (const keyword of BOOK_KEYWORDS) {
    if (containsAlias(lowered, keyword)) {
      score += 1;
      matches++;
    }
  }

  const contentTags = extractHashtags(plainContent);
  for (const tag of contentTags) {
    if (BOOK_HASHTAGS.includes(tag)) {
      score += 2;
      matches++;
    }
  }

  if (activity.object.tag) {
    for (const tag of activity.object.tag) {
      const tagName = (tag.name || "").toLowerCase().replace(/^#/, "");
      if (BOOK_HASHTAGS.includes(tagName)) {
        score += 2;
        matches++;
      }
    }
  }

  // Entity-aware boost — recognizes authors, books, comics even without hashtags
  const entityMatches = matchEntitiesInContent(plainContent, options.entities);
  if (entityMatches.length > 0) {
    score += ENTITY_MATCH_BOOST * entityMatches.length;
    matches += entityMatches.length;
  }

  // Query-aware boost — favor posts that match the user's current search query.
  // Splits camelCase tokens too, so a `#MitchAlbom` query also boosts on "Mitch Albom".
  const rawQuery = (options.query || "").trim();
  if (rawQuery.length >= 2) {
    const tokenSet = new Set<string>();
    for (const raw of rawQuery.split(/[^A-Za-z0-9_#]+/g)) {
      if (!raw) continue;
      const stripped = raw.replace(/^#+/, "");
      const split = splitCamelCase(stripped);
      if (split && split.includes(" ")) {
        for (const word of split.split(/\s+/)) {
          if (word.length >= 3) tokenSet.add(word.toLowerCase());
        }
      }
      if (stripped.length >= 3) tokenSet.add(stripped.toLowerCase());
    }
    let queryHits = 0;
    for (const token of tokenSet) {
      if (containsAlias(lowered, token)) queryHits++;
    }
    if (queryHits > 0) {
      score += QUERY_MATCH_BOOST * queryHits;
      matches += queryHits;
    }
  }

  // Normalize by content length (avoid boosting very short posts)
  const normalizedScore = matches > 0 ? score / (plainContent.length / 100 + 1) : 0;
  return { score: normalizedScore, entityMatches };
}

function safeHostname(actorId: string): string {
  try {
    return new URL(actorId).hostname;
  } catch {
    return "unknown";
  }
}

function buildAuthorHandle(actor: RelayActivity["actor"]): string {
  const username = actor.preferredUsername || "unknown";
  const host = safeHostname(actor.id);
  return `@${username}@${host}`;
}

function parseActivityPubCollection(response: unknown): RelayActivity[] {
  const items: RelayActivity[] = [];
  if (!response || typeof response !== "object") return items;
  const orderedItems = (response as { orderedItems?: unknown }).orderedItems;
  if (!Array.isArray(orderedItems)) return items;

  for (const raw of orderedItems.slice(0, MAX_ITEMS_PER_POLL)) {
    try {
      const item = raw as any;
      if (item?.type !== "Create" && item?.type !== "Announce") continue;
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
          content: typeof item.object?.content === "string" ? item.object.content : "",
          attributedTo: item.object?.attributedTo || item.actor?.id || "unknown",
          published: item.object?.published || item.published || new Date().toISOString(),
          url: item.object?.url || item.url,
          inReplyTo: item.object?.inReplyTo,
          tag: Array.isArray(item.object?.tag) ? item.object.tag : undefined,
          attachment: Array.isArray(item.object?.attachment) ? item.object.attachment : undefined,
        },
        published: item.published || new Date().toISOString(),
      };
      items.push(activity);
    } catch (e) {
      console.debug("Failed to parse ActivityPub item:", e);
    }
  }

  return items;
}

export async function pollRelayBuzz(options: RelayDiscoveryOptions = {}): Promise<RelayDiscoveryResult[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = options.outboxUrl ?? RELAY_BUZZ_OUTBOX;

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/activity+json" },
    });

    if (!response.ok) {
      throw new Error(`Relay poll failed: ${response.status}`);
    }

    const data = await response.json();
    const activities = parseActivityPubCollection(data);
    const results: RelayDiscoveryResult[] = [];

    for (const activity of activities) {
      const plain = stripHtmlForScan(activity.object.content);
      const { score, entityMatches } = calculateRelevanceScore(activity, plain, {
        entities: options.entities,
        query: options.query,
      });

      // An entity match alone qualifies even if static keywords miss
      const passes = score >= CONTENT_RELEVANCE_THRESHOLD || entityMatches.length > 0;
      if (!passes) continue;

      results.push({
        id: activity.object.id,
        content: activity.object.content,
        author: activity.actor.name || activity.actor.preferredUsername,
        authorHandle: buildAuthorHandle(activity.actor),
        authorAvatar: activity.actor.icon?.url,
        publishedAt: activity.object.published,
        url: activity.object.url,
        hashtags: extractHashtags(plain),
        mentions: extractMentions(plain),
        matchedEntities: entityMatches,
        relevance: score,
        source: "relay.fedi.buzz",
      });
    }

    // Rank: entity-matched posts first, then by relevance, then by recency
    results.sort((a, b) => {
      if (a.matchedEntities.length !== b.matchedEntities.length) {
        return b.matchedEntities.length - a.matchedEntities.length;
      }
      if (a.relevance !== b.relevance) return b.relevance - a.relevance;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    return results;
  } catch (error) {
    console.error("Relay discovery poll error:", error);
    return [];
  }
}

/**
 * Convert RelayDiscoveryResult to a simplified MastodonStatus-like format
 * for integration with existing UI components.
 */
export function relayResultToMastodonStatus(result: RelayDiscoveryResult) {
  const handleParts = result.authorHandle.replace(/^@/, "").split("@");
  const host = handleParts[1] || "relay.fedi.buzz";
  return {
    id: result.id,
    content: result.content,
    account: {
      id: result.authorHandle,
      username: handleParts[0] || result.authorHandle,
      acct: result.authorHandle.replace(/^@/, ""),
      display_name: result.author,
      avatar: result.authorAvatar,
      url: `https://${host}/`,
    },
    created_at: result.publishedAt,
    url: result.url,
    tags: result.hashtags.map((tag) => ({
      name: tag,
      url: `https://relay.fedi.buzz/tags/${tag}`,
    })),
    mentions: result.mentions.map((mention) => ({
      id: mention,
      username: mention.replace(/^@/, ""),
      acct: mention.replace(/^@/, ""),
      url: `https://relay.fedi.buzz/users/${mention.replace(/^@/, "")}`,
    })),
    matchedEntities: result.matchedEntities,
    source: result.source,
  };
}

// Track last poll time to avoid hammering the relay
let lastPollTime = 0;

export function _resetRelayThrottleForTests() {
  lastPollTime = 0;
}

export async function getRelayDiscovery(options: RelayDiscoveryOptions = {}): Promise<RelayDiscoveryResult[]> {
  const now = Date.now();

  if (now - lastPollTime < RELAY_POLL_INTERVAL_MS) {
    return [];
  }

  lastPollTime = now;
  return pollRelayBuzz(options);
}
