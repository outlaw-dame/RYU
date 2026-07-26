import React from "react";
import { useTranslation } from "react-i18next";
import {
  listRecommendationFeedbackOptions,
  type RecommendationFeedbackState
} from "../../recommendations";

export type RecommendationFeedbackMenuProps = {
  pending?: boolean;
  error?: string | null;
  onSelect(state: RecommendationFeedbackState): void | Promise<void>;
};

const OPTIONS = Object.freeze(listRecommendationFeedbackOptions());

export function RecommendationFeedbackMenu({
  pending = false,
  error = null,
  onSelect
}: RecommendationFeedbackMenuProps) {
  const { t } = useTranslation();

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      style={{ display: "grid", justifyItems: "end", gap: "var(--space-1)" }}
    >
      <details>
        <summary
          aria-label={t("discovery.feedback.tuneAria")}
          style={{
            cursor: pending ? "wait" : "pointer",
            color: "var(--color-text-tertiary)",
            fontSize: "var(--text-caption1)",
            padding: "var(--space-1) var(--space-2)",
            borderRadius: "var(--radius-sm)",
            listStyle: "none",
            userSelect: "none"
          }}
        >
          {pending ? t("discovery.feedback.saving") : t("discovery.feedback.tune")}
        </summary>
        <div
          role="menu"
          aria-label={t("discovery.feedback.menuLabel")}
          style={{
            display: "grid",
            minWidth: 210,
            marginTop: "var(--space-1)",
            padding: "var(--space-1)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md)",
            position: "absolute",
            right: "var(--space-4)",
            zIndex: 2
          }}
        >
          {OPTIONS.map((option) => (
            <button
              key={option.state}
              type="button"
              role="menuitem"
              disabled={pending}
              title={t(`discovery.feedback.${option.state}Description`)}
              onClick={() => void onSelect(option.state)}
              style={{
                border: "none",
                background: "none",
                color: option.destructive
                  ? "var(--color-danger, var(--color-text))"
                  : "var(--color-text)",
                textAlign: "left",
                padding: "var(--space-2)",
                borderRadius: "var(--radius-sm)",
                cursor: pending ? "wait" : "pointer",
                fontSize: "var(--text-caption1)"
              }}
            >
              {t(`discovery.feedback.${option.state}`)}
            </button>
          ))}
        </div>
      </details>
      {error && (
        <span role="status" style={{ color: "var(--color-danger, var(--color-text-secondary))", fontSize: "var(--text-caption2)" }}>
          {t(error)}
        </span>
      )}
    </div>
  );
}
