/**
 * Klipy GIF API client.
 *
 * Provides search and trending endpoints for GIFs and stickers.
 * Uses the Klipy API (https://docs.klipy.com/) — requires an API key
 * configured via VITE_KLIPY_API_KEY env var.
 *
 * The test key allows 100 calls/hour. Production keys are unlimited.
 */

export type KlipyMediaType = "gif" | "sticker" | "clip" | "meme";

export type KlipyResult = {
  id: string;
  title: string;
  /** URL to the animated content (webp preferred, gif fallback). */
  url: string;
  /** Static preview image URL. */
  previewUrl: string;
  /** Original GIF URL (larger file). */
  originalUrl: string;
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
  /** Content type. */
  mediaType: KlipyMediaType;
};

export type KlipySearchOptions = {
  /** Search query. */
  query: string;
  /** Number of results (default 20, max 50). */
  limit?: number;
  /** Offset for pagination. */
  offset?: number;
  /** Media type filter. */
  type?: KlipyMediaType;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
};

export type KlipyTrendingOptions = {
  /** Number of results (default 20, max 50). */
  limit?: number;
  /** Offset for pagination. */
  offset?: number;
  /** Media type filter. */
  type?: KlipyMediaType;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
};

const KLIPY_BASE_URL = "https://api.klipy.com/v1";

function getApiKey(): string {
  // Vite env var — set VITE_KLIPY_API_KEY in .env
  const key = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_KLIPY_API_KEY;
  return key || "";
}

/**
 * Check if Klipy API is configured (has an API key).
 */
export function isKlipyConfigured(): boolean {
  return getApiKey().length > 0;
}

/**
 * Search GIFs/stickers via Klipy API.
 */
export async function searchKlipy(options: KlipySearchOptions): Promise<KlipyResult[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const params = new URLSearchParams({
    api_key: apiKey,
    q: options.query,
    limit: String(options.limit ?? 20),
    offset: String(options.offset ?? 0)
  });

  const endpoint = options.type === "sticker"
    ? `${KLIPY_BASE_URL}/stickers/search`
    : `${KLIPY_BASE_URL}/gifs/search`;

  const response = await fetch(`${endpoint}?${params}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: options.signal
  });

  if (!response.ok) return [];

  const data = await response.json();
  return parseKlipyResponse(data, options.type ?? "gif");
}

/**
 * Get trending GIFs/stickers via Klipy API.
 */
export async function trendingKlipy(options: KlipyTrendingOptions = {}): Promise<KlipyResult[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const params = new URLSearchParams({
    api_key: apiKey,
    limit: String(options.limit ?? 20),
    offset: String(options.offset ?? 0)
  });

  const endpoint = options.type === "sticker"
    ? `${KLIPY_BASE_URL}/stickers/trending`
    : `${KLIPY_BASE_URL}/gifs/trending`;

  const response = await fetch(`${endpoint}?${params}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: options.signal
  });

  if (!response.ok) return [];

  const data = await response.json();
  return parseKlipyResponse(data, options.type ?? "gif");
}

/**
 * Parse Klipy API response into our normalized format.
 */
function parseKlipyResponse(data: unknown, mediaType: KlipyMediaType): KlipyResult[] {
  if (!data || typeof data !== "object") return [];

  const items = (data as Record<string, unknown>).results ?? (data as Record<string, unknown>).data;
  if (!Array.isArray(items)) return [];

  return items
    .map((item: unknown) => parseKlipyItem(item, mediaType))
    .filter((r): r is KlipyResult => r !== null);
}

function parseKlipyItem(item: unknown, mediaType: KlipyMediaType): KlipyResult | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;

  const id = String(record.id ?? "");
  const title = String(record.title ?? record.content_description ?? "");

  // Klipy provides media in various formats — prefer webp for size, fall back to gif
  const media = record.media as Record<string, unknown> | undefined;
  const formats = media ?? record as Record<string, unknown>;

  // Try to extract URLs from common Klipy response shapes
  const webp = formats.webp as Record<string, unknown> | undefined;
  const gif = formats.gif as Record<string, unknown> | undefined;
  const preview = formats.preview as Record<string, unknown> | undefined;
  const original = formats.original as Record<string, unknown> | undefined;

  const url = String(webp?.url ?? gif?.url ?? record.url ?? record.content_url ?? "");
  const previewUrl = String(preview?.url ?? webp?.url ?? record.preview_url ?? record.thumbnail_url ?? url);
  const originalUrl = String(original?.url ?? gif?.url ?? record.original_url ?? url);

  const width = Number(original?.width ?? record.width ?? 200);
  const height = Number(original?.height ?? record.height ?? 200);

  if (!id || !url) return null;

  return { id, title, url, previewUrl, originalUrl, width, height, mediaType };
}
