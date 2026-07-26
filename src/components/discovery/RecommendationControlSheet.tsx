/**
 * Recommendation Control Sheet — action panel for controlling
 * recommendation signals on a specific item.
 *
 * Actions: show more, show less, not interested, hide author, why this?
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRecommendationSignals } from "../../hooks/useRecommendationSignals";
import { buildExplanation } from "../../recommendations/explanation-trace";
import type { ScoredRecommendation } from "../../recommendations/unified-scorer";
import type { ExplanationLine } from "../../recommendations/explanation-trace";

export interface RecommendationControlSheetProps {
  recommendation: ScoredRecommendation;
  onClose: () => void;
  open: boolean;
}

export function RecommendationControlSheet({
  recommendation,
  onClose,
  open
}: RecommendationControlSheetProps) {
  const { t } = useTranslation();
  const { add } = useRecommendationSignals();
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanationLines, setExplanationLines] = useState<ExplanationLine[]>([]);

  if (!open) return null;

  const handleShowMore = () => {
    add({
      entityType: recommendation.entityType,
      entityId: recommendation.id,
      kind: "show_more",
      strength: 1.0
    });
    onClose();
  };

  const handleShowLess = () => {
    add({
      entityType: recommendation.entityType,
      entityId: recommendation.id,
      kind: "show_less",
      strength: 1.0
    });
    onClose();
  };

  const handleNotInterested = () => {
    add({
      entityType: recommendation.entityType,
      entityId: recommendation.id,
      kind: "not_interested",
      strength: 1.0
    });
    onClose();
  };

  const handleHideAuthor = () => {
    // Extract author ID from the recommendation's reasons if available,
    // otherwise use the recommendation ID with author entity type
    const authorId = recommendation.reasons?.[0]?.sourceId ?? recommendation.id;
    add({
      entityType: "author",
      entityId: authorId,
      kind: "suppress",
      strength: 1.0
    });
    onClose();
  };

  const handleWhyThis = () => {
    const lines = buildExplanation(recommendation);
    setExplanationLines(lines);
    setShowExplanation(true);
  };

  return (
    <div
      className="recommendation-control-sheet"
      role="dialog"
      aria-label={t("discovery.explanationTitle")}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center"
      }}
    >
      {/* Backdrop */}
      <div
        className="recommendation-control-sheet__backdrop"
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--color-backdrop, rgba(0, 0, 0, 0.4))"
        }}
      />

      {/* Sheet content */}
      <div
        className="recommendation-control-sheet__content"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "28rem",
          background: "var(--color-surface, #fff)",
          borderRadius: "var(--radius-lg, 1rem) var(--radius-lg, 1rem) 0 0",
          padding: "var(--space-md, 1rem)",
          paddingBottom: "var(--space-lg, 1.5rem)"
        }}
      >
        {/* Handle indicator */}
        <div
          style={{
            width: "2.5rem",
            height: "0.25rem",
            borderRadius: "var(--radius-full, 9999px)",
            background: "var(--color-border, #ccc)",
            margin: "0 auto var(--space-md, 1rem)"
          }}
        />

        {!showExplanation ? (
          <div
            className="recommendation-control-sheet__actions"
            style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs, 0.5rem)" }}
          >
            <ActionButton onClick={handleShowMore} label={t("discovery.showMore")} />
            <ActionButton onClick={handleShowLess} label={t("discovery.showLess")} />
            <ActionButton onClick={handleNotInterested} label={t("discovery.notInterested")} />
            <ActionButton onClick={handleHideAuthor} label={t("discovery.hideAuthor")} />
            <ActionButton onClick={handleWhyThis} label={t("discovery.whyThis")} />
          </div>
        ) : (
          <div className="recommendation-control-sheet__explanation">
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: 600,
                margin: "0 0 var(--space-sm, 0.75rem)",
                color: "var(--color-text-primary, #1a1a1a)"
              }}
            >
              {t("discovery.explanationTitle")}
            </h3>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-xs, 0.5rem)"
              }}
            >
              {explanationLines.map((line, idx) => (
                <li
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-xs, 0.5rem)",
                    fontSize: "0.875rem",
                    color: "var(--color-text-secondary, #555)"
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: "0.5rem",
                      height: "0.5rem",
                      borderRadius: "var(--radius-full, 9999px)",
                      background: line.positive
                        ? "var(--color-success, #22c55e)"
                        : "var(--color-error, #ef4444)",
                      flexShrink: 0
                    }}
                  />
                  <span>{line.label}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setShowExplanation(false)}
              style={{
                marginTop: "var(--space-md, 1rem)",
                padding: "var(--space-xs, 0.5rem) var(--space-md, 1rem)",
                borderRadius: "var(--radius-md, 0.5rem)",
                border: "1px solid var(--color-border, #ccc)",
                background: "transparent",
                color: "var(--color-text-primary, #1a1a1a)",
                cursor: "pointer",
                fontSize: "0.875rem"
              }}
            >
              ← {t("shared.previous")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        padding: "var(--space-sm, 0.75rem) var(--space-md, 1rem)",
        borderRadius: "var(--radius-md, 0.5rem)",
        border: "none",
        background: "var(--color-surface-elevated, #f5f5f5)",
        color: "var(--color-text-primary, #1a1a1a)",
        fontSize: "0.9375rem",
        textAlign: "left",
        cursor: "pointer"
      }}
    >
      {label}
    </button>
  );
}
