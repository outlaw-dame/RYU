/** Recommendation control sheet for explicit, reversible user signals. */

import { useEffect, useState } from "react";
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
  const authorId = recommendation.authorIds?.[0];

  useEffect(() => {
    if (!open) {
      setShowExplanation(false);
      setExplanationLines([]);
    }
  }, [open]);

  if (!open) return null;

  const addAndClose = (kind: "show_more" | "show_less" | "not_interested") => {
    add({
      entityType: recommendation.entityType,
      entityId: recommendation.id,
      kind,
      strength: 1
    });
    onClose();
  };

  const handleHideAuthor = () => {
    if (!authorId) return;
    add({
      entityType: "author",
      entityId: authorId,
      kind: "suppress",
      strength: 1
    });
    onClose();
  };

  const handleWhyThis = () => {
    setExplanationLines(buildExplanation(recommendation));
    setShowExplanation(true);
  };

  return (
    <div
      className="recommendation-control-sheet"
      role="dialog"
      aria-modal="true"
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
      <button
        type="button"
        className="recommendation-control-sheet__backdrop"
        onClick={onClose}
        aria-label={t("shared.close")}
        style={{
          position: "absolute",
          inset: 0,
          border: 0,
          background: "var(--color-backdrop, rgba(0, 0, 0, 0.4))"
        }}
      />
      <div
        className="recommendation-control-sheet__content"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "28rem",
          background: "var(--color-surface, #fff)",
          borderRadius: "var(--radius-lg, 1rem) var(--radius-lg, 1rem) 0 0",
          padding: "var(--space-md, 1rem)",
          paddingBottom: "calc(var(--space-lg, 1.5rem) + env(safe-area-inset-bottom))"
        }}
      >
        <div aria-hidden="true" style={{
          width: "2.5rem",
          height: "0.25rem",
          borderRadius: "var(--radius-full, 9999px)",
          background: "var(--color-border, #ccc)",
          margin: "0 auto var(--space-md, 1rem)"
        }} />

        {!showExplanation ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs, 0.5rem)" }}>
            <ActionButton onClick={() => addAndClose("show_more")} label={t("discovery.showMore")} />
            <ActionButton onClick={() => addAndClose("show_less")} label={t("discovery.showLess")} />
            <ActionButton onClick={() => addAndClose("not_interested")} label={t("discovery.notInterested")} />
            {authorId && <ActionButton onClick={handleHideAuthor} label={t("discovery.hideAuthor")} />}
            <ActionButton onClick={handleWhyThis} label={t("discovery.whyThis")} />
          </div>
        ) : (
          <div>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 var(--space-sm, 0.75rem)" }}>
              {t("discovery.explanationTitle")}
            </h3>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "var(--space-xs, 0.5rem)" }}>
              {explanationLines.map((line, index) => (
                <li key={`${line.label}-${index}`} style={{ display: "flex", alignItems: "center", gap: "var(--space-xs, 0.5rem)" }}>
                  <span aria-hidden="true" style={{
                    width: "0.5rem",
                    height: "0.5rem",
                    borderRadius: "50%",
                    background: line.positive ? "var(--color-success, #22c55e)" : "var(--color-error, #ef4444)"
                  }} />
                  <span>{line.label}</span>
                </li>
              ))}
            </ul>
            <ActionButton onClick={() => setShowExplanation(false)} label={`← ${t("shared.previous")}`} />
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
        minHeight: 44,
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
