/** Discovery recommendation card with an accessible control-menu trigger. */

import React from "react";
import { useTranslation } from "react-i18next";
import { buildPrimaryExplanation } from "../../discovery/explanation-builder";
import type { ScoredRecommendation } from "../../recommendations/unified-scorer";

export type RecommendationCardProps = {
  recommendation: ScoredRecommendation;
  onControls?: (recommendation: ScoredRecommendation) => void;
  onSelect?: (id: string) => void;
};

export function RecommendationCard({
  recommendation,
  onControls,
  onSelect
}: RecommendationCardProps) {
  const { t } = useTranslation();
  const explanation = buildPrimaryExplanation(recommendation.reasons);

  return (
    <div
      role="article"
      style={{
        display: "grid",
        gridTemplateColumns: recommendation.coverUrl ? "56px 1fr auto" : "1fr auto",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        background: "var(--color-surface-secondary)",
        borderRadius: "var(--radius-lg)",
        alignItems: "center",
        cursor: onSelect ? "pointer" : undefined
      }}
      onClick={() => onSelect?.(recommendation.id)}
    >
      {recommendation.coverUrl && (
        <img
          src={recommendation.coverUrl}
          alt={t("discovery.coverAlt", { title: recommendation.title })}
          style={{ width: 56, height: 80, objectFit: "cover", borderRadius: "var(--radius-sm)" }}
        />
      )}

      <div style={{ minWidth: 0 }}>
        <p style={{
          margin: 0,
          fontWeight: 600,
          fontSize: "var(--text-subhead)",
          lineHeight: "var(--leading-subhead)",
          color: "var(--color-text)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}>
          {recommendation.title}
        </p>
        {recommendation.author && (
          <p style={{
            margin: "var(--space-0-5) 0 0",
            fontSize: "var(--text-caption1)",
            color: "var(--color-text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}>
            {recommendation.author}
          </p>
        )}
        <p style={{
          margin: "var(--space-1) 0 0",
          fontSize: "var(--text-caption2)",
          color: "var(--color-text-tertiary)",
          fontStyle: "italic"
        }}>
          {t(explanation.key, explanation.params)}
        </p>
      </div>

      {onControls && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onControls(recommendation);
          }}
          aria-label={t("discovery.whyThis")}
          aria-haspopup="dialog"
          style={{
            border: "none",
            background: "none",
            color: "var(--color-text-tertiary)",
            fontSize: "1.25rem",
            lineHeight: 1,
            cursor: "pointer",
            minWidth: 44,
            minHeight: 44,
            borderRadius: "var(--radius-sm)"
          }}
        >
          •••
        </button>
      )}
    </div>
  );
}
