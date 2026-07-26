import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { PolicyDecision } from "../../moderation/policy-types";

export type ModerationInterventionGateProps = {
  decision: PolicyDecision;
  children: ReactNode;
  /** Stable identity for the moderated content version, when the caller has one. */
  contentIdentity?: string;
};

/**
 * Requires an explicit reveal for non-hide moderation decisions. Hidden items
 * must be removed by the caller and are deliberately not revealable here.
 */
export function ModerationInterventionGate({
  decision,
  children,
  contentIdentity = ""
}: ModerationInterventionGateProps) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const detailsId = useId();
  const decisionIdentity = useMemo(() => JSON.stringify({
    action: decision.action,
    collapseSummary: decision.collapseSummary ?? "",
    reasons: decision.reasons,
    matchedFilterIds: decision.matchedFilters.map((filter) => filter.id),
    safetyLabels: decision.safetyLabels.map((label) => `${label.label}:${label.severity}`),
    contentIdentity
  }), [contentIdentity, decision]);

  // A reveal grants access only to the exact rendered content and policy result.
  // Parent refreshes, edits, or reclassification create a new child/identity and
  // therefore require a fresh explicit reveal. Resetting conservatively is safer
  // than carrying permission across content versions.
  useEffect(() => {
    setRevealed(false);
  }, [children, decisionIdentity]);

  if (decision.action === "show") return <>{children}</>;
  if (decision.action === "hide") return null;

  const summary = decision.collapseSummary?.trim()
    || decision.reasons.find((reason) => reason.trim().length > 0)
    || t("moderation.contentWarning");

  if (revealed) {
    return (
      <div style={{ display: "grid", gap: "var(--space-2)" }}>
        <div id={detailsId}>{children}</div>
        <button
          type="button"
          onClick={() => setRevealed(false)}
          aria-controls={detailsId}
          aria-expanded="true"
          style={buttonStyle}
        >
          {t("moderation.hideContent")}
        </button>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={t("moderation.contentWarning")}
      style={{
        borderRadius: "var(--radius-md)",
        border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)",
        background: "var(--color-bg-secondary)",
        padding: "var(--space-4)",
        display: "grid",
        gap: "var(--space-3)"
      }}
    >
      <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
        {summary}
      </p>
      <button
        type="button"
        onClick={() => setRevealed(true)}
        aria-controls={detailsId}
        aria-expanded="false"
        style={buttonStyle}
      >
        {t("moderation.showAnyway")}
      </button>
    </div>
  );
}

const buttonStyle = {
  justifySelf: "start",
  minHeight: 44,
  border: "1px solid color-mix(in srgb, var(--color-text) 14%, transparent)",
  borderRadius: "999px",
  background: "var(--color-bg-elevated)",
  color: "var(--color-text)",
  padding: "0 var(--space-4)",
  fontSize: "var(--text-footnote)",
  fontWeight: 700,
  cursor: "pointer"
} as const;
