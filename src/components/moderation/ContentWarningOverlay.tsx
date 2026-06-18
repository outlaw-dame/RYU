/**
 * Phase 35 - Content Warning Overlay.
 *
 * Renders a blurred/hidden overlay for content that has a content warning,
 * is marked sensitive, or matched a content filter with "warn" or "blur" action.
 * Includes a "Show anyway" button to reveal the content.
 */

import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { ModerationDecision } from "../../moderation/types";

export type ContentWarningOverlayProps = {
  /** The moderation decision (warn or blur). */
  decision: ModerationDecision;
  /** Content warning / spoiler text to display. */
  warningText?: string;
  /** The children to conditionally reveal. */
  children: React.ReactNode;
};

/**
 * Overlay component that hides content behind a warning.
 * Used for content warnings, sensitive media, and content filter matches.
 */
export function ContentWarningOverlay({
  decision,
  warningText,
  children
}: ContentWarningOverlayProps) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);

  const handleReveal = useCallback(() => {
    setRevealed(true);
  }, []);

  const handleHide = useCallback(() => {
    setRevealed(false);
  }, []);

  // If decision is "show", render children directly
  if (decision === "show") {
    return <>{children}</>;
  }

  // If decision is "hide", render nothing
  if (decision === "hide") {
    return null;
  }

  // "warn" or "blur" decisions: show overlay unless revealed
  if (revealed) {
    return (
      <div className="cw-revealed">
        <button
          type="button"
          className="cw-hide-button"
          onClick={handleHide}
          aria-label={t("moderation.hideContent")}
          style={{
            display: "inline-block",
            marginBottom: "var(--space-2)",
            padding: "var(--space-1) var(--space-2)",
            fontSize: "var(--text-caption1)",
            background: "var(--color-surface-secondary)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            color: "var(--color-text-secondary)"
          }}
        >
          {t("moderation.hideContent")}
        </button>
        {children}
      </div>
    );
  }

  return (
    <div
      className="cw-overlay"
      role="region"
      aria-label={t("moderation.contentWarning")}
      style={{
        padding: "var(--space-3)",
        background: "var(--color-surface-secondary)",
        borderRadius: "var(--radius-md)",
        textAlign: "center",
        border: "1px solid var(--color-border)"
      }}
    >
      <p
        style={{
          margin: "0 0 var(--space-2)",
          fontWeight: 600,
          fontSize: "var(--text-body)",
          color: "var(--color-text-primary)"
        }}
      >
        {decision === "blur"
          ? t("moderation.sensitiveContent")
          : t("moderation.contentWarning")}
      </p>
      {warningText && (
        <p
          style={{
            margin: "0 0 var(--space-3)",
            fontSize: "var(--text-caption1)",
            color: "var(--color-text-secondary)"
          }}
        >
          {warningText}
        </p>
      )}
      <button
        type="button"
        className="cw-show-button"
        onClick={handleReveal}
        aria-label={t("moderation.showAnyway")}
        style={{
          padding: "var(--space-2) var(--space-3)",
          fontSize: "var(--text-caption1)",
          background: "var(--color-surface-primary)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          color: "var(--color-text-primary)"
        }}
      >
        {t("moderation.showAnyway")}
      </button>
    </div>
  );
}
