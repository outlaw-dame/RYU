/**
 * Phase 28 - Review Card.
 *
 * Displays a review with content, star rating, publication date,
 * and optional visibility badge.
 */

import { useTranslation } from "react-i18next";
import { AppIcon } from "../../design/icons/AppIcon";
import type { ReviewDoc } from "../../db/schema";

export interface ReviewCardProps {
  review: ReviewDoc;
}

function StarRating({ rating }: { rating: number }) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <AppIcon
        key={i}
        name="star"
        size={16}
        state={i <= rating ? "active" : "subtle"}
        color={i <= rating ? "var(--color-accent)" : "var(--color-text-tertiary)"}
      />
    );
  }
  return (
    <div style={{ display: "flex", gap: 2 }} aria-hidden="true">
      {stars}
    </div>
  );
}

export function ReviewCard({ review }: ReviewCardProps) {
  const { t, i18n } = useTranslation();

  const formattedDate = new Date(review.published).toLocaleDateString(i18n.language, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });

  return (
    <article
      style={{
        padding: "var(--space-4)",
        borderRadius: "var(--radius-lg)",
        background: "var(--color-bg-secondary)",
        display: "grid",
        gap: "var(--space-3)"
      }}
    >
      {/* Header: rating + date */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          {review.rating != null && review.rating > 0 ? (
            <>
              <StarRating rating={review.rating} />
              <span
                style={{
                  fontSize: "var(--text-caption1)",
                  color: "var(--color-text-secondary)"
                }}
                aria-label={t("review.rating", { count: review.rating })}
              >
                {review.rating}/5
              </span>
            </>
          ) : null}
        </div>
        <time
          dateTime={review.published}
          style={{
            fontSize: "var(--text-caption2)",
            color: "var(--color-text-tertiary)"
          }}
        >
          {formattedDate}
        </time>
      </div>

      {/* Title */}
      {review.title ? (
        <h3
          style={{
            margin: 0,
            fontSize: "var(--text-footnote)",
            fontWeight: 700,
            color: "var(--color-text)"
          }}
        >
          {review.title}
        </h3>
      ) : null}

      {/* Content */}
      <p
        style={{
          margin: 0,
          fontSize: "var(--text-footnote)",
          lineHeight: "var(--leading-footnote)",
          color: "var(--color-text-secondary)",
          whiteSpace: "pre-wrap"
        }}
      >
        {review.content}
      </p>
    </article>
  );
}
