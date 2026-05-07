import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { sanitizeUrl } from "../../lib/sanitize";

type Book = {
  id: string;
  title: string;
  author?: string;
  coverUrl?: string | null;
  isbn10?: string | null;
  isbn13?: string | null;
  sourceUrl?: string | null;
  titleUrl?: string | null;
  authorUrl?: string | null;
};

type OLDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  cover_i?: number;
  isbn?: string[];
  number_of_pages_median?: number;
  first_publish_year?: number;
  publisher?: string[];
  language?: string[];
  first_sentence?: unknown;
  edition_count?: number;
};

type GoogleBooksVolume = {
  title?: string;
  authors?: string[];
  description?: string;
  pageCount?: number;
  publishedDate?: string;
  publisher?: string;
  language?: string;
  infoLink?: string;
  imageLinks?: {
    smallThumbnail?: string;
    thumbnail?: string;
    small?: string;
    medium?: string;
    large?: string;
    extraLarge?: string;
  };
  industryIdentifiers?: Array<{
    type?: string;
    identifier?: string;
  }>;
};

type GoogleBooksSearchResponse = {
  items?: Array<{
    volumeInfo?: GoogleBooksVolume;
  }>;
};

function extractFirstSentence(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw.trim() || null;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && item.trim()) return item.trim();
      if (item && typeof item === "object") {
        const v = (item as { value?: string }).value;
        if (typeof v === "string" && v.trim()) return v.trim();
      }
    }
  }
  if (raw && typeof raw === "object") {
    const v = (raw as { value?: string }).value;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function proxyUrl(url: string): string {
  const safe = sanitizeUrl(url);
  if (!safe) return url;
  try {
    const parsed = new URL(safe);
    if (parsed.origin === window.location.origin) return safe;
    if (parsed.protocol !== "https:") return safe;
    return `/api/media/cover?url=${encodeURIComponent(safe)}`;
  } catch {
    return url;
  }
}

function languageLabel(codes: string[]): string {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const code of codes.slice(0, 3)) {
    if (seen.has(code)) continue;
    seen.add(code);
    try {
      const label = new Intl.DisplayNames(["en"], { type: "language" }).of(code.toLowerCase()) ?? code;
      labels.push(label);
    } catch {
      labels.push(code);
    }
  }
  return labels.join(", ");
}

function normalizeIsbn(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (normalized.length !== 10 && normalized.length !== 13) return null;
  return normalized;
}

function googleBooksCoverUrlForIsbn(isbn: string, zoom = 2): string {
  return `https://books.google.com/books/content?vid=ISBN${encodeURIComponent(isbn)}&printsec=frontcover&img=1&zoom=${zoom}&source=gbs_api`;
}

function backoffMs(attempt: number): number {
  return Math.min(4_000, 200 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200));
}

function parsePublishedYear(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/\b(\d{4})\b/);
  if (!match) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeGoogleBooksImageUrl(url: string | undefined): string | null {
  if (!url) return null;
  const normalized = url.startsWith("http://") ? `https://${url.slice("http://".length)}` : url;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function pickGoogleBooksImage(volume: GoogleBooksVolume | null): string | null {
  if (!volume?.imageLinks) return null;
  return (
    normalizeGoogleBooksImageUrl(volume.imageLinks.extraLarge) ??
    normalizeGoogleBooksImageUrl(volume.imageLinks.large) ??
    normalizeGoogleBooksImageUrl(volume.imageLinks.medium) ??
    normalizeGoogleBooksImageUrl(volume.imageLinks.small) ??
    normalizeGoogleBooksImageUrl(volume.imageLinks.thumbnail) ??
    normalizeGoogleBooksImageUrl(volume.imageLinks.smallThumbnail)
  );
}

function pickGoogleBooksIsbn(volume: GoogleBooksVolume | null): string | null {
  const identifiers = volume?.industryIdentifiers;
  if (!identifiers?.length) return null;

  const isbn13 = identifiers.find((item) => item.type === "ISBN_13")?.identifier;
  const isbn10 = identifiers.find((item) => item.type === "ISBN_10")?.identifier;
  return normalizeIsbn(isbn13) ?? normalizeIsbn(isbn10);
}

async function fetchJsonWithBackoff<T>(
  url: string,
  options: RequestInit,
  attempts = 3,
  timeoutMs = 8_000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: {
          Accept: "application/json",
          ...(options.headers ?? {})
        }
      });

      window.clearTimeout(timer);

      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
        if (retryable && attempt < attempts) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, backoffMs(attempt)));
          continue;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      window.clearTimeout(timer);
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, backoffMs(attempt)));
      }
    }
  }

  throw lastError ?? new Error("Request failed");
}

function buildGoogleBooksQuery(book: Book): string {
  const isbn = normalizeIsbn(book.isbn13) ?? normalizeIsbn(book.isbn10);
  if (isbn) return `isbn:${isbn}`;

  const title = book.title.trim();
  const author = book.author?.trim();
  if (author) return `intitle:${title} inauthor:${author}`;
  return `intitle:${title}`;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "var(--space-2)", alignItems: "baseline" }}>
      <span style={{ fontSize: "var(--text-caption1)", color: "var(--color-text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </span>
      <span style={{ fontSize: "var(--text-footnote)", color: "var(--color-text-secondary)" }}>
        {value}
      </span>
    </div>
  );
}

function SkeletonLine({ width = "60%" }: { width?: string }) {
  return (
    <div
      style={{
        height: 13,
        borderRadius: 6,
        background: "color-mix(in srgb, var(--color-text) 8%, transparent)",
        width
      }}
    />
  );
}

export function BookDetailSheet({ book, onClose }: { book: Book; onClose: () => void }) {
  const { t } = useTranslation();
  const [doc, setDoc] = useState<OLDoc | null>(null);
  const [googleVolume, setGoogleVolume] = useState<GoogleBooksVolume | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDoc(null);
    setGoogleVolume(null);

    const params = new URLSearchParams();
    if (book.title) params.set("title", book.title);
    if (book.author) params.set("author", book.author);
    params.set(
      "fields",
      "key,title,author_name,cover_i,isbn,number_of_pages_median,first_publish_year,publisher,language,first_sentence,edition_count"
    );
    params.set("limit", "1");

    const load = async () => {
      let openLibraryDoc: OLDoc | null = null;

      try {
        const data = await fetchJsonWithBackoff<{ docs?: OLDoc[] }>(
          `https://openlibrary.org/search.json?${params.toString()}`,
          { method: "GET" },
          3,
          7_500
        );
        openLibraryDoc = data.docs?.[0] ?? null;
        if (!cancelled && openLibraryDoc) setDoc(openLibraryDoc);
      } catch {
        // Best-effort: metadata gracefully degrades to book payload and Google fallback.
      }

      const shouldLookupGoogle =
        !openLibraryDoc ||
        (!openLibraryDoc.number_of_pages_median &&
          !openLibraryDoc.first_publish_year &&
          !openLibraryDoc.publisher?.[0] &&
          !extractFirstSentence(openLibraryDoc.first_sentence));

      if (shouldLookupGoogle) {
        try {
          const googleQuery = buildGoogleBooksQuery(book);
          const googleUrl = new URL("https://www.googleapis.com/books/v1/volumes");
          googleUrl.searchParams.set("q", googleQuery);
          googleUrl.searchParams.set("maxResults", "1");
          googleUrl.searchParams.set(
            "fields",
            "items(volumeInfo/title,volumeInfo/authors,volumeInfo/description,volumeInfo/pageCount,volumeInfo/publishedDate,volumeInfo/publisher,volumeInfo/language,volumeInfo/infoLink,volumeInfo/imageLinks,volumeInfo/industryIdentifiers)"
          );

          const response = await fetchJsonWithBackoff<GoogleBooksSearchResponse>(
            googleUrl.toString(),
            { method: "GET" },
            3,
            7_500
          );
          const candidateVolume = response.items?.[0]?.volumeInfo ?? null;
          if (!cancelled) setGoogleVolume(candidateVolume);
        } catch {
          // Best-effort only.
        }
      }

      if (!cancelled) setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [book.title, book.author]);

  const title = doc?.title ?? googleVolume?.title ?? book.title;
  const author = doc?.author_name?.[0] ?? googleVolume?.authors?.[0] ?? book.author;
  const pages = doc?.number_of_pages_median ?? googleVolume?.pageCount;
  const year = doc?.first_publish_year ?? parsePublishedYear(googleVolume?.publishedDate);
  const publisher = doc?.publisher?.[0] ?? googleVolume?.publisher;
  const langs = doc?.language?.length
    ? languageLabel(doc.language)
    : googleVolume?.language
      ? languageLabel([googleVolume.language])
      : null;
  const isbn = doc?.isbn?.[0] ?? pickGoogleBooksIsbn(googleVolume);
  const editionCount = doc?.edition_count;
  const synopsis = extractFirstSentence(doc?.first_sentence) ?? googleVolume?.description ?? null;
  const olUrl = doc?.key ? sanitizeUrl(`https://openlibrary.org${doc.key}`) : null;

  const isbnFromDoc = normalizeIsbn(doc?.isbn?.[0]);
  const isbnFromBook = normalizeIsbn(book.isbn13) ?? normalizeIsbn(book.isbn10);
  const rawCoverUrl =
    doc?.cover_i != null
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
      : (book.coverUrl?.replace(/-[SM]\.jpg$/, "-L.jpg") ??
        (pickGoogleBooksImage(googleVolume) ??
          (isbnFromDoc ? googleBooksCoverUrlForIsbn(isbnFromDoc, 2) : isbnFromBook ? googleBooksCoverUrlForIsbn(isbnFromBook, 2) : null)));
  const coverSrc = rawCoverUrl ? proxyUrl(rawCoverUrl) : null;

  const placeholder = title
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .filter(Boolean)
    .join("")
    .toUpperCase() || "B";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} - ${t("bookDetail.dialogLabel")}`}
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in srgb, var(--color-bg) 60%, black 40%)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        zIndex: 60
      }}
      onClick={onClose}
    >
      <section
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-bg-elevated)",
          borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
          padding: "var(--space-5) var(--space-4)",
          paddingBottom: "calc(var(--space-6) + env(safe-area-inset-bottom, 0px))",
          display: "grid",
          gap: "var(--space-5)",
          maxHeight: "88dvh",
          overflowY: "auto",
          boxShadow: "0 -2px 24px rgba(0,0,0,0.14)"
        }}
      >
        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)" }}>
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontSize: "var(--text-headline)",
                fontWeight: 700,
                color: "var(--color-text)",
                lineHeight: "var(--leading-headline)"
              }}
            >
              {title}
            </h2>
            {author ? (
              <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-footnote)", color: "var(--color-text-secondary)" }}>
                {t("bookDetail.by")} <strong style={{ color: "var(--color-text)", fontWeight: 600 }}>{author}</strong>
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("bookDetail.closeAria")}
            style={{
              flexShrink: 0,
              border: 0,
              borderRadius: "var(--radius-sm)",
              background: "var(--color-bg-secondary)",
              color: "var(--color-text-secondary)",
              fontWeight: 600,
              fontSize: "var(--text-footnote)",
              minHeight: "var(--touch-min)",
              padding: "0 var(--space-3)",
              cursor: "pointer"
            }}
          >
            {t("bookDetail.close")}
          </button>
        </div>

        {/* ── Cover + metadata ── */}
        <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "flex-start" }}>
          {/* Cover */}
          <div
            style={{
              flexShrink: 0,
              width: 108,
              aspectRatio: "2 / 3",
              borderRadius: "var(--radius-cover)",
              overflow: "hidden",
              background: "linear-gradient(145deg, var(--color-bg-secondary), var(--color-bg-tertiary))",
              boxShadow: "var(--shadow-cover)",
              display: "grid",
              placeItems: "center",
              position: "relative"
            }}
          >
            <span aria-hidden="true" style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)", fontWeight: 700 }}>
              {placeholder}
            </span>
            {coverSrc ? (
              <img
                src={coverSrc}
                alt={`${t("bookDetail.coverOf")} ${title}`}
                loading="eager"
                decoding="async"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                onError={(e) => {
                  e.currentTarget.hidden = true;
                }}
              />
            ) : null}
          </div>

          {/* Metadata */}
          <div style={{ display: "grid", gap: "var(--space-3)", flex: 1, minWidth: 0 }}>
            {loading ? (
              <>
                <SkeletonLine width="65%" />
                <SkeletonLine width="80%" />
                <SkeletonLine width="50%" />
                <SkeletonLine width="70%" />
              </>
            ) : (
              <>
                {pages ? <MetaRow label={t("bookDetail.pages")} value={pages.toLocaleString()} /> : null}
                {year ? <MetaRow label={t("bookDetail.published")} value={publisher ? `${year} · ${publisher}` : String(year)} /> : null}
                {langs ? <MetaRow label={t("bookDetail.language")} value={langs} /> : null}
                {isbn ? <MetaRow label="ISBN" value={isbn} /> : null}
                {editionCount != null ? (
                  <MetaRow label={t("bookDetail.editions")} value={t("bookDetail.editionCount", { count: editionCount })} />
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* ── Synopsis ── */}
        {synopsis ? (
          <div style={{ display: "grid", gap: "var(--space-2)", borderTop: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)", paddingTop: "var(--space-4)" }}>
            <p
              style={{
                margin: 0,
                fontSize: "var(--text-caption1)",
                color: "var(--color-text-tertiary)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em"
              }}
            >
              {t("bookDetail.about")}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: "var(--text-footnote)",
                color: "var(--color-text-secondary)",
                lineHeight: "var(--leading-footnote)"
              }}
            >
              {synopsis}
            </p>
          </div>
        ) : null}

        {/* ── Actions ── */}
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            flexWrap: "wrap",
            borderTop: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)",
            paddingTop: "var(--space-4)"
          }}
        >
          {olUrl ? (
            <a
              href={olUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                minHeight: "var(--touch-min)",
                border: "1px solid color-mix(in srgb, var(--color-accent) 50%, transparent)",
                borderRadius: "var(--radius-md)",
                background: "color-mix(in srgb, var(--color-accent) 10%, var(--color-bg))",
                color: "var(--color-accent)",
                fontWeight: 700,
                fontSize: "var(--text-footnote)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
                gap: "var(--space-2)"
              }}
            >
              {t("bookDetail.openOnOpenLibrary")}
            </a>
          ) : null}
          {!olUrl && loading ? (
            <div
              style={{
                flex: 1,
                minHeight: "var(--touch-min)",
                borderRadius: "var(--radius-md)",
                background: "color-mix(in srgb, var(--color-text) 6%, transparent)"
              }}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
