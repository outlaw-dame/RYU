import { useEffect, useState } from "react";
import { sanitizeUrl } from "../../lib/sanitize";

type Book = {
  id: string;
  title: string;
  author?: string;
  coverUrl?: string | null;
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
  const [doc, setDoc] = useState<OLDoc | null>(null);
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

    const params = new URLSearchParams();
    if (book.title) params.set("title", book.title);
    if (book.author) params.set("author", book.author);
    params.set(
      "fields",
      "key,title,author_name,cover_i,isbn,number_of_pages_median,first_publish_year,publisher,language,first_sentence,edition_count"
    );
    params.set("limit", "1");

    fetch(`https://openlibrary.org/search.json?${params.toString()}`)
      .then((r) => r.json())
      .then((data: { docs?: OLDoc[] }) => {
        if (!cancelled && data.docs?.[0]) setDoc(data.docs[0]);
      })
      .catch(() => {
        /* silent — fall back to what we know from the book object */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [book.title, book.author]);

  const title = doc?.title ?? book.title;
  const author = doc?.author_name?.[0] ?? book.author;
  const pages = doc?.number_of_pages_median;
  const year = doc?.first_publish_year;
  const publisher = doc?.publisher?.[0];
  const langs = doc?.language?.length ? languageLabel(doc.language) : null;
  const isbn = doc?.isbn?.[0];
  const editionCount = doc?.edition_count;
  const synopsis = extractFirstSentence(doc?.first_sentence);
  const olUrl = doc?.key ? sanitizeUrl(`https://openlibrary.org${doc.key}`) : null;

  const rawCoverUrl =
    doc?.cover_i != null
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
      : (book.coverUrl?.replace(/-[SM]\.jpg$/, "-L.jpg") ?? null);
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
      aria-label={`${title} — book details`}
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
                by <strong style={{ color: "var(--color-text)", fontWeight: 600 }}>{author}</strong>
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close book detail"
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
            Close
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
                alt={`Cover of ${title}`}
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
                {pages ? <MetaRow label="Pages" value={pages.toLocaleString()} /> : null}
                {year ? <MetaRow label="Published" value={publisher ? `${year} · ${publisher}` : String(year)} /> : null}
                {langs ? <MetaRow label="Language" value={langs} /> : null}
                {isbn ? <MetaRow label="ISBN" value={isbn} /> : null}
                {editionCount != null ? (
                  <MetaRow label="Editions" value={`${editionCount.toLocaleString()} edition${editionCount !== 1 ? "s" : ""}`} />
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
              About
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
              Open on OpenLibrary
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
