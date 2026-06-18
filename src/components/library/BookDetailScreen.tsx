/**
 * Phase 28 - Book Detail Screen.
 *
 * Full book detail view: cover, title, author, description, ISBN,
 * reading status control, reviews, and links to author/edition details.
 */

import { useTranslation } from "react-i18next";
import { useBookDetail } from "../../hooks/useBookDetail";
import { AppIcon } from "../../design/icons/AppIcon";
import { ReadingStatusControl } from "./ReadingStatusControl";
import { ReviewCard } from "./ReviewCard";
import { sanitizeUrl } from "../../lib/sanitize";

export interface BookDetailScreenProps {
  editionId: string;
  onClose: () => void;
  onAuthorPress?: (authorId: string) => void;
}

function proxyUrl(url: string): string {
  const safe = sanitizeUrl(url);
  if (!safe) return url;
  try {
    const parsed = new URL(safe, window.location.origin);
    if (parsed.origin === window.location.origin) return safe;
    if (parsed.protocol !== "https:") return safe;
    return `/api/media/cover?url=${encodeURIComponent(safe)}`;
  } catch {
    return url;
  }
}

function getHostname(urlStr: string): string {
  try {
    return new URL(urlStr).hostname;
  } catch {
    return "";
  }
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

export function BookDetailScreen({ editionId, onClose, onAuthorPress }: BookDetailScreenProps) {
  const { t } = useTranslation();
  const { detail, loading, updateStatus } = useBookDetail(editionId);

  if (loading && !detail) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("bookDetail.dialogLabel")}
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
            gap: "var(--space-5)"
          }}
        >
          <SkeletonLine width="70%" />
          <SkeletonLine width="50%" />
          <SkeletonLine width="80%" />
          <SkeletonLine width="40%" />
        </section>
      </div>
    );
  }

  if (!detail) return null;

  const { edition, authors, reviews } = detail;
  const coverSrc = edition.coverUrl ? proxyUrl(edition.coverUrl) : null;
  const authorText = authors.map((a) => a.name).join(", ");

  const placeholder = edition.title
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
      aria-label={`${edition.title} - ${t("bookDetail.dialogLabel")}`}
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
        {/* Header */}
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
              {edition.title}
            </h2>
            {edition.subtitle ? (
              <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-footnote)", color: "var(--color-text-secondary)", fontStyle: "italic" }}>
                {edition.subtitle}
              </p>
            ) : null}
            {authorText ? (
              <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-footnote)", color: "var(--color-text-secondary)" }}>
                {t("bookDetail.by")}{" "}
                <strong style={{ color: "var(--color-text)", fontWeight: 600 }}>{authorText}</strong>
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

        {/* Cover + Metadata */}
        <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "flex-start" }}>
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
                alt={`${t("bookDetail.coverOf")} ${edition.title}`}
                loading="eager"
                decoding="async"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                onError={(e) => { e.currentTarget.hidden = true; }}
              />
            ) : null}
          </div>

          <div style={{ display: "grid", gap: "var(--space-3)", flex: 1, minWidth: 0 }}>
            {edition.isbn13 ? (
              <MetaRow label={t("bookDetail.isbn13")} value={edition.isbn13} />
            ) : null}
            {edition.isbn10 ? (
              <MetaRow label={t("bookDetail.isbn10")} value={edition.isbn10} />
            ) : null}
            {edition.sourceUrl && getHostname(edition.sourceUrl) ? (
              <MetaRow label={t("bookDetail.source")} value={getHostname(edition.sourceUrl)} />
            ) : null}
          </div>
        </div>

        {/* Reading Status */}
        <ReadingStatusControl
          currentStatus={detail.readingStatus}
          onChange={updateStatus}
        />

        {/* Description */}
        {edition.description ? (
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
              {t("bookDetail.description")}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: "var(--text-footnote)",
                color: "var(--color-text-secondary)",
                lineHeight: "var(--leading-footnote)",
                whiteSpace: "pre-wrap"
              }}
            >
              {edition.description}
            </p>
          </div>
        ) : null}

        {/* Authors */}
        {authors.length > 0 ? (
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
              {t("bookDetail.authors")}
            </p>
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              {authors.map((author) => (
                <button
                  key={author.id}
                  type="button"
                  onClick={() => onAuthorPress?.(author.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    padding: "var(--space-2) var(--space-3)",
                    border: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-bg-secondary)",
                    color: "var(--color-text)",
                    fontSize: "var(--text-footnote)",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left"
                  }}
                >
                  <AppIcon name="user" size={16} />
                  {author.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Reviews */}
        {reviews.length > 0 ? (
          <div style={{ display: "grid", gap: "var(--space-3)", borderTop: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)", paddingTop: "var(--space-4)" }}>
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
              {t("bookDetail.reviews")}
            </p>
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        ) : null}

        {/* Source link */}
        {edition.sourceUrl ? (
          <div style={{ borderTop: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)", paddingTop: "var(--space-4)" }}>
            <a
              href={sanitizeUrl(edition.sourceUrl) ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--space-2)",
                minHeight: "var(--touch-min)",
                border: "1px solid color-mix(in srgb, var(--color-accent) 50%, transparent)",
                borderRadius: "var(--radius-md)",
                background: "color-mix(in srgb, var(--color-accent) 10%, var(--color-bg))",
                color: "var(--color-accent)",
                fontWeight: 700,
                fontSize: "var(--text-footnote)",
                textDecoration: "none"
              }}
            >
              <AppIcon name="external" size={16} color="var(--color-accent)" />
              {t("bookDetail.viewSource")}
            </a>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "var(--space-2)", alignItems: "baseline" }}>
      <span style={{ fontSize: "var(--text-caption1)", color: "var(--color-text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </span>
      <span style={{ fontSize: "var(--text-footnote)", color: "var(--color-text-secondary)" }}>
        {value}
      </span>
    </div>
  );
}
