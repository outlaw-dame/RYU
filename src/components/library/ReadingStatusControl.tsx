/**
 * Phase 28 - Reading Status Control.
 *
 * A picker allowing the user to set reading status for a book:
 * want-to-read, reading, read, or did-not-finish.
 * Persists to localStorage via the useLibrary hook.
 */

import { useTranslation } from "react-i18next";
import { AppIcon } from "../../design/icons/AppIcon";
import type { ReadingStatus } from "../../hooks/useLibrary";

export interface ReadingStatusControlProps {
  currentStatus?: ReadingStatus;
  onChange: (status: ReadingStatus | undefined) => void;
}

const statuses: Array<{ value: ReadingStatus; iconState: "default" | "active" }> = [
  { value: "want-to-read", iconState: "default" },
  { value: "reading", iconState: "default" },
  { value: "read", iconState: "default" },
  { value: "did-not-finish", iconState: "default" }
];

function statusLabel(status: ReadingStatus, t: (key: string) => string): string {
  switch (status) {
    case "want-to-read": return t("readingStatus.wantToRead");
    case "reading": return t("readingStatus.reading");
    case "read": return t("readingStatus.read");
    case "did-not-finish": return t("readingStatus.didNotFinish");
  }
}

export function ReadingStatusControl({ currentStatus, onChange }: ReadingStatusControlProps) {
  const { t } = useTranslation();

  return (
    <fieldset
      style={{
        border: 0,
        margin: 0,
        padding: 0,
        display: "grid",
        gap: "var(--space-2)"
      }}
      aria-label={t("readingStatus.label")}
    >
      <legend
        style={{
          fontSize: "var(--text-caption1)",
          color: "var(--color-text-tertiary)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "var(--space-2)"
        }}
      >
        {t("readingStatus.label")}
      </legend>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-2)"
        }}
      >
        {statuses.map(({ value }) => {
          const isActive = currentStatus === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onChange(isActive ? undefined : value)}
              aria-pressed={isActive}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                minHeight: "var(--touch-min)",
                padding: "0 var(--space-3)",
                border: isActive
                  ? "1.5px solid var(--color-accent)"
                  : "1px solid color-mix(in srgb, var(--color-text) 14%, transparent)",
                borderRadius: "var(--radius-md)",
                background: isActive
                  ? "color-mix(in srgb, var(--color-accent) 10%, var(--color-bg))"
                  : "var(--color-bg-secondary)",
                color: isActive ? "var(--color-accent)" : "var(--color-text)",
                fontWeight: isActive ? 700 : 500,
                fontSize: "var(--text-footnote)",
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s"
              }}
            >
              {isActive ? (
                <AppIcon name="check" size={16} color="var(--color-accent)" />
              ) : null}
              {statusLabel(value, t)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
