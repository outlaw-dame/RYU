import type { CSSProperties, SyntheticEvent } from "react";
import { motion } from "framer-motion";
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

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(88px, 128px))",
  justifyContent: "start",
  alignItems: "start",
  gap: "var(--space-4) var(--space-3)",
  padding: "0 var(--space-4)"
};

const itemStyle: CSSProperties = {
  display: "grid",
  gap: "var(--space-2)",
  width: "100%",
  minWidth: 0
};

const coverFrameStyle: CSSProperties = {
  position: "relative",
  display: "grid",
  placeItems: "center",
  aspectRatio: "2 / 3",
  borderRadius: "var(--radius-cover)",
  overflow: "hidden",
  background: "linear-gradient(145deg, var(--color-bg-secondary), var(--color-bg-tertiary))",
  boxShadow: "var(--shadow-cover)"
};

const coverActionStyle: CSSProperties = {
  display: "block",
  width: "100%",
  padding: 0,
  border: 0,
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  WebkitTapHighlightColor: "transparent"
};

const titleLinkStyle: CSSProperties = {
  color: "var(--color-text)",
  fontSize: "var(--text-footnote)",
  fontWeight: 600,
  lineHeight: "var(--leading-footnote)",
  letterSpacing: "var(--tracking-footnote)",
  textDecoration: "none",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden"
};

const authorLinkStyle: CSSProperties = {
  display: "block",
  marginTop: 2,
  color: "var(--color-text-tertiary)",
  fontSize: "var(--text-caption2)",
  lineHeight: "var(--leading-caption2)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  textDecoration: "none"
};

function openLibraryBookSearchUrl(book: Book): string {
  const query = [book.title, book.author].filter(Boolean).join(" ");
  return `https://openlibrary.org/search?q=${encodeURIComponent(query)}`;
}

function openLibraryAuthorSearchUrl(author: string): string {
  return `https://openlibrary.org/search/authors?q=${encodeURIComponent(author)}`;
}

function resolveBookHref(book: Book): string {
  return sanitizeUrl(book.titleUrl ?? book.sourceUrl) ?? openLibraryBookSearchUrl(book);
}

function resolveAuthorHref(book: Book): string | null {
  if (!book.author) return null;
  return sanitizeUrl(book.authorUrl) ?? openLibraryAuthorSearchUrl(book.author);
}

function resolveCoverSrc(coverUrl: string | null | undefined): string | null {
  const safeUrl = sanitizeUrl(coverUrl);
  if (!safeUrl) return null;

  const parsed = new URL(safeUrl, window.location.origin);
  if (parsed.origin === window.location.origin) return parsed.toString();
  if (parsed.protocol !== "https:") return null;

  return `/api/media/cover?url=${encodeURIComponent(parsed.toString())}`;
}

function coverPlaceholder(title: string): string {
  const initials = title
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .toUpperCase();

  return initials || "Book";
}

function hideBrokenCover(event: SyntheticEvent<HTMLImageElement>): void {
  event.currentTarget.hidden = true;
}

export function CoverGrid({ books, onBookPress }: { books: Book[]; onBookPress?: (book: Book) => void }) {
  return (
    <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }} style={gridStyle}>
      {books.map((book) => {
        const href = resolveBookHref(book);
        const authorHref = resolveAuthorHref(book);
        const coverSrc = resolveCoverSrc(book.coverUrl);
        const cover = (
          <div style={coverFrameStyle}>
            <span aria-hidden="true" style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)", fontWeight: 700 }}>
              {coverPlaceholder(book.title)}
            </span>
            {coverSrc ? (
              <img
                src={coverSrc}
                alt={`Cover of ${book.title}`}
                loading="lazy"
                decoding="async"
                onError={hideBrokenCover}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : null}
          </div>
        );

        return (
          <motion.div key={book.id} variants={{ hidden: { opacity: 0, y: 8, scale: 0.96 }, show: { opacity: 1, y: 0, scale: 1 } }} style={itemStyle}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${book.title}`}
              onClick={onBookPress ? (e) => { e.preventDefault(); onBookPress(book); } : undefined}
              style={coverActionStyle}
            >
              {cover}
            </a>
            <div>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={titleLinkStyle}
                onClick={onBookPress ? (e) => { e.preventDefault(); onBookPress(book); } : undefined}
              >
                {book.title}
              </a>
              {book.author ? (
                <a href={authorHref ?? openLibraryAuthorSearchUrl(book.author)} target="_blank" rel="noopener noreferrer" style={authorLinkStyle}>
                  {book.author}
                </a>
              ) : null}
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
