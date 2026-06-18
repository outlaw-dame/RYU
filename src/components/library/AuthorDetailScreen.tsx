/**
 * Phase 28 - Author Detail Screen.
 *
 * Displays author information (name, bio) and lists their
 * works and editions from the local database.
 */

import { useTranslation } from "react-i18next";
import { useAuthorDetail } from "../../hooks/useAuthorDetail";
import { AppIcon } from "../../design/icons/AppIcon";
import { EmptyState } from "../common/EmptyState";

export interface AuthorDetailScreenProps {
  authorId: string;
  onClose: () => void;
  onEditionPress?: (editionId: string) => void;
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

export function AuthorDetailScreen({ authorId, onClose, onEditionPress }: AuthorDetailScreenProps) {
  const { t } = useTranslation();
  const { detail, loading } = useAuthorDetail(authorId);

  if (loading && !detail) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("authorDetail.bio")}
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
            gap: "var(--space-4)"
          }}
        >
          <SkeletonLine width="50%" />
          <SkeletonLine width="80%" />
          <SkeletonLine width="65%" />
        </section>
      </div>
    );
  }

  if (!detail) return null;

  const { author, works, editions } = detail;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={author.name}
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
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minWidth: 0 }}>
            <div
              style={{
                flexShrink: 0,
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "var(--color-bg-tertiary)",
                display: "grid",
                placeItems: "center"
              }}
            >
              <AppIcon name="user" size={24} color="var(--color-text-tertiary)" />
            </div>
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
              {author.name}
            </h2>
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

        {/* Bio */}
        {author.summary ? (
          <div style={{ display: "grid", gap: "var(--space-2)" }}>
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
              {t("authorDetail.bio")}
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
              {author.summary}
            </p>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: "var(--text-footnote)", color: "var(--color-text-tertiary)" }}>
            {t("authorDetail.noBio")}
          </p>
        )}

        {/* Works */}
        {works.length > 0 ? (
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
              {t("authorDetail.works")}
            </p>
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              {works.map((work) => (
                <div
                  key={work.id}
                  style={{
                    padding: "var(--space-3)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-bg-secondary)",
                    display: "grid",
                    gap: "var(--space-1)"
                  }}
                >
                  <span style={{ fontSize: "var(--text-footnote)", fontWeight: 600, color: "var(--color-text)" }}>
                    {work.title}
                  </span>
                  {work.summary ? (
                    <span style={{ fontSize: "var(--text-caption2)", color: "var(--color-text-tertiary)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {work.summary}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Editions */}
        {editions.length > 0 ? (
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
              {t("authorDetail.editions")}
            </p>
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              {editions.map((edition) => (
                <button
                  key={edition.id}
                  type="button"
                  onClick={() => onEditionPress?.(edition.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "var(--space-3)",
                    padding: "var(--space-3)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-bg-secondary)",
                    border: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%"
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: "var(--text-footnote)", fontWeight: 600, color: "var(--color-text)", display: "block" }}>
                      {edition.title}
                    </span>
                    {edition.isbn13 || edition.isbn10 ? (
                      <span style={{ fontSize: "var(--text-caption2)", color: "var(--color-text-tertiary)" }}>
                        ISBN: {edition.isbn13 ?? edition.isbn10}
                      </span>
                    ) : null}
                  </div>
                  <AppIcon name="book" size={18} color="var(--color-text-tertiary)" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState title={t("authorDetail.noWorks")} />
        )}
      </section>
    </div>
  );
}
