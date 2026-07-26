/**
 * Phase 28 - Review Card.
 *
 * Displays a review with content, star rating, publication date,
 * and verified reviewer trust controls when authenticated.
 */

import { useTranslation } from "react-i18next";
import { AppIcon } from "../../design/icons/AppIcon";
import type { ReviewDoc } from "../../db/schema";
import { ReviewerTrustControl } from "./ReviewerTrustControl";

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
  return <div style={{ display: "flex", gap: 2 }} aria-hidden="true">{stars}</div>;
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
        position: "relative",
        padding: "var(--space-4)",
        borderRadius: "var(--radius-lg)",
        background: "var(--color-bg-secondary)",
        display: "grid",
        gap: "var(--space-3)"
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minHeight: "var(--touch-min)" }}>
          {review.rating != null && review.rating > 0 ? (
            <>
              <StarRating rating={review.rating} />
              <span
                style={{ fontSize: "var(--text-caption1)", color: "var(--color-text-secondary)" }}
                aria-label={t("review.rating", { count: review.rating })}
              >
                {review.rating}/5
              </span>
            </>
          ) : null}
        </div>
        <div style={{ display: "grid", justifyItems: "end", gap: "var(--space-1)" }}>
          <time
            dateTime={review.published}
            style={{ fontSize: "var(--text-caption2)", color: "var(--color-text-tertiary)" }}
          >
            {formattedDate}
          </time>
          <ReviewerTrustControl review={review} />
        </div>
      </div>

      {review.title ? (
        <h3 style={{ margin: 0, fontSize: "var(--text-footnote)", fontWeight: 700, color: "var(--color-text)" }}>
          {review.title}
        </h3>
      ) : null}

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
