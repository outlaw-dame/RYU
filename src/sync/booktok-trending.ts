import { z } from "zod";

export type BookTokTrend = {
  id: string;
  title: string;
  author?: string;
  coverUrl?: string;
  sourceUrl?: string;
  reason?: string;
  mentionCount?: number;
};

const trendSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  author: z.string().optional(),
  coverUrl: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
  reason: z.string().optional(),
  mentionCount: z.number().int().nonnegative().optional()
});

const responseSchema = z.object({
  items: z.array(trendSchema).max(40)
});

export const CURATED_BOOKTOK_TRENDS: BookTokTrend[] = [
  {
    id: "booktok-1",
    title: "Fourth Wing",
    author: "Rebecca Yarros",
    coverUrl: "https://covers.openlibrary.org/b/isbn/9781649374042-M.jpg",
    reason: "Dragon-rider romantasy momentum",
    mentionCount: 12400
  },
  {
    id: "booktok-2",
    title: "A Court of Thorns and Roses",
    author: "Sarah J. Maas",
    coverUrl: "https://covers.openlibrary.org/b/isbn/9781619634442-M.jpg",
    reason: "Backlist revival in fantasy threads",
    mentionCount: 9800
  },
  {
    id: "booktok-3",
    title: "The Song of Achilles",
    author: "Madeline Miller",
    coverUrl: "https://covers.openlibrary.org/b/isbn/9780062060624-M.jpg",
    reason: "Emotional historical retellings",
    mentionCount: 7600
  },
  {
    id: "booktok-4",
    title: "The Seven Husbands of Evelyn Hugo",
    author: "Taylor Jenkins Reid",
    coverUrl: "https://covers.openlibrary.org/b/isbn/9781501161933-M.jpg",
    reason: "Celebrity-drama recommendations",
    mentionCount: 6900
  },
  {
    id: "booktok-5",
    title: "Tomorrow, and Tomorrow, and Tomorrow",
    author: "Gabrielle Zevin",
    coverUrl: "https://covers.openlibrary.org/b/isbn/9780593321201-M.jpg",
    reason: "Story-rich literary picks",
    mentionCount: 5200
  },
  {
    id: "booktok-6",
    title: "Divine Rivals",
    author: "Rebecca Ross",
    coverUrl: "https://covers.openlibrary.org/b/isbn/9781250857439-M.jpg",
    reason: "Rising romantasy and war letters",
    mentionCount: 4700
  }
];

export function parseBookTokTrendingPayload(payload: unknown): BookTokTrend[] {
  const parsed = responseSchema.parse(payload);

  return parsed.items.map((item, index) => ({
    id: item.id.trim() || `booktok-${index + 1}`,
    title: item.title.trim(),
    author: item.author?.trim() || undefined,
    coverUrl: item.coverUrl,
    sourceUrl: item.sourceUrl,
    reason: item.reason?.trim() || undefined,
    mentionCount: item.mentionCount
  }));
}