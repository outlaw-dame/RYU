/**
 * Phase 34 - RecommendationCard component.
 *
 * Renders a single recommendation with its ranking-derived explanation and user controls.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { buildPrimaryExplanation } from "../../discovery/explanation-builder";
import type { Recommendation } from "../../discovery/types";
import type { RecommendationFeedbackState } from "../../recommendations";
import { RecommendationFeedbackMenu } from "./RecommendationFeedbackMenu";

export type RecommendationCardProps = {
  recommendation: Recommendation;
  onDismiss?: (id: string) => void;
  onDismissRecommendation?: (recommendation: Recommendation) => void;
  onFeedback?: (
    recommendation: Recommendation,
    state: RecommendationFeedbackState
  ) => void | Promise<void>;
  feedbackPending?: boolean;
  feedbackError?: string | null;
  onSelect?: (id: string) => void;
};

export function RecommendationCard({
  recommendation,
  onDismiss,
  onDismissRecommendation,
  onFeedback,
  feedbackPending = false,
  feedbackError = null,
  onSelect
}: RecommendationCardProps) {
  const { t } = useTranslation();
  const explanation = buildPrimaryExplanation(recommendation.reasons);
  const canDismiss = Boolean(onDismissRecommendation || onDismiss);
  const trace = recommendation.scoreTrace;

  return (
    <div
      role="article"
      style={{
        position: "relative",
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
        <p style={{ margin: 0, fontWeight: 600, fontSize: "var(--text-subhead)", lineHeight: "var(--leading-subhead)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {recommendation.title}
        </p>

        {recommendation.author && (
          <p style={{ margin: "var(--space-0-5) 0 0", fontSize: "var(--text-caption1)", color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {recommendation.author}
          </p>
        )}

        <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-caption2)", color: "var(--color-text-tertiary)", fontStyle: "italic" }}>
          {t(explanation.key, explanation.params)}
        </p>

        {trace && (
          <details onClick={(event) => event.stopPropagation()} style={{ marginTop: "var(--space-1)" }}>
            <summary style={{ cursor: "pointer", color: "var(--color-accent)", fontSize: "var(--text-caption2)" }}>
              {t("search.whyThisResult")}
            </summary>
            <ul style={{ margin: "var(--space-1) 0 0", paddingInlineStart: "var(--space-4)", color: "var(--color-text-secondary)", fontSize: "var(--text-caption2)" }}>
              {trace.contributions.map((contribution) => (
                <li key={contribution.id}>
                  {t(contribution.labelKey, contribution.labelParams)}
                  {contribution.delta !== 0 ? ` (${contribution.delta > 0 ? "+" : ""}${contribution.delta.toFixed(2)})` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div style={{ display: "grid", justifyItems: "end", gap: "var(--space-1)" }}>
        {onFeedback && (
          <RecommendationFeedbackMenu
            pending={feedbackPending}
            error={feedbackError}
            onSelect={(state) => onFeedback(recommendation, state)}
          />
        )}

        {!onFeedback && canDismiss && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (onDismissRecommendation) onDismissRecommendation(recommendation);
              else onDismiss?.(recommendation.id);
            }}
            aria-label={t("discovery.dismiss")}
            style={{ border: "none", background: "none", color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)", cursor: "pointer", padding: "var(--space-1)", borderRadius: "var(--radius-sm)" }}
          >
            &times;
          </button>
        )}
      </div>
    </div>
  );
}
