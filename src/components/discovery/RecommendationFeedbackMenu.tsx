import React from "react";
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
  return (
    <div
      onClick={(event) => event.stopPropagation()}
      style={{ display: "grid", justifyItems: "end", gap: "var(--space-1)" }}
    >
      <details>
        <summary
          aria-label="Tune this recommendation"
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
          {pending ? "Saving…" : "Tune"}
        </summary>
        <div
          role="menu"
          aria-label="Recommendation preferences"
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
              title={option.description}
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
              {option.label}
            </button>
          ))}
        </div>
      </details>
      {error && (
        <span role="status" style={{ color: "var(--color-danger, var(--color-text-secondary))", fontSize: "var(--text-caption2)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
