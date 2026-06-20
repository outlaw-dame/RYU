import { z } from "zod";

export type TrendingBook = {
  id: string;
  title: string;
  author?: string;
  coverUrl?: string;
  sourceUrl?: string;
  reason?: string;
};

/** @deprecated Use TrendingBook instead */
export type BookTokTrend = TrendingBook;

const trendSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  author: z.string().optional(),
  coverUrl: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
  reason: z.string().optional()
});

const responseSchema = z.object({
  items: z.array(trendSchema).max(40)
});

const OPEN_LIBRARY_USER_AGENT = "RYU/0.2.0 (BookWyrm PWA; +https://github.com/outlaw-dame/RYU)";
const OPEN_LIBRARY_TRENDING_URL = "https://openlibrary.org/trending/daily.json";
const MAX_TRENDING_RESULTS = 12;

/**
 * Open Library trending response shape (partial — we only use what we need).
 */
const openLibraryWorkSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  author_name: z.array(z.string()).optional(),
  author_key: z.array(z.string()).optional(),
  cover_edition_key: z.string().optional(),
  cover_i: z.number().optional(),
  edition_count: z.number().optional(),
  first_publish_year: z.number().optional()
});

const openLibraryTrendingResponseSchema = z.object({
  works: z.array(openLibraryWorkSchema)
});

/**
 * Fetches trending books from Open Library's public daily trending endpoint.
 * Returns up to MAX_TRENDING_RESULTS items mapped to TrendingBook format.
 */
export async function fetchOpenLibraryTrending(signal?: AbortSignal): Promise<TrendingBook[]> {
  const response = await fetch(OPEN_LIBRARY_TRENDING_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": OPEN_LIBRARY_USER_AGENT
    },
    signal
  });

  if (!response.ok) {
    throw new Error(`Open Library responded with ${response.status}`);
  }

  const data = openLibraryTrendingResponseSchema.parse(await response.json());

  return data.works.slice(0, MAX_TRENDING_RESULTS).map((work) => ({
    id: work.key,
    title: work.title,
    author: work.author_name?.[0] ?? undefined,
    coverUrl: work.cover_i
      ? `https://covers.openlibrary.org/b/id/${work.cover_i}-M.jpg`
      : undefined,
    sourceUrl: `https://openlibrary.org${work.key}`,
    reason: "Trending on Open Library"
  }));
}

export const CURATED_TRENDING_BOOKS: TrendingBook[] = [
  {
    id: "booktok-1",
    title: "Fourth Wing",
    author: "Rebecca Yarros",
    coverUrl: "https://covers.openlibrary.org/b/isbn/9781649374042-M.jpg",
    reason: "Dragon-rider romantasy momentum"
  },
  {
    id: "booktok-2",
    title: "A Court of Thorns and Roses",
    author: "Sarah J. Maas",
    coverUrl: "https://covers.openlibrary.org/b/isbn/9781619634442-M.jpg",
    reason: "Backlist revival in fantasy threads"
  },
  {
    id: "booktok-3",
    title: "The Song of Achilles",
    author: "Madeline Miller",
    coverUrl: "https://covers.openlibrary.org/b/isbn/9780062060624-M.jpg",
    reason: "Emotional historical retellings"
  },
  {
    id: "booktok-4",
    title: "The Seven Husbands of Evelyn Hugo",
    author: "Taylor Jenkins Reid",
    coverUrl: "https://covers.openlibrary.org/b/isbn/9781501156700-M.jpg",
    reason: "Celebrity-drama recommendations"
  },
  {
    id: "booktok-5",
    title: "Tomorrow, and Tomorrow, and Tomorrow",
    author: "Gabrielle Zevin",
    coverUrl: "https://covers.openlibrary.org/b/isbn/9780593321201-M.jpg",
    reason: "Story-rich literary picks"
  },
  {
    id: "booktok-6",
    title: "Divine Rivals",
    author: "Rebecca Ross",
    coverUrl: "https://covers.openlibrary.org/b/isbn/9781250857439-M.jpg",
    reason: "Rising romantasy and war letters"
  }
];

/** @deprecated Use CURATED_TRENDING_BOOKS instead */
export const CURATED_BOOKTOK_TRENDS: TrendingBook[] = CURATED_TRENDING_BOOKS;

export function parseTrendingBooksPayload(payload: unknown): TrendingBook[] {
  const parsed = responseSchema.parse(payload);

  return parsed.items.map((item, index) => ({
    id: item.id.trim() || `trending-${index + 1}`,
    title: item.title.trim(),
    author: item.author?.trim() || undefined,
    coverUrl: item.coverUrl,
    sourceUrl: item.sourceUrl,
    reason: item.reason?.trim() || undefined
  }));
}

/** @deprecated Use parseTrendingBooksPayload instead */
export const parseBookTokTrendingPayload = parseTrendingBooksPayload;
