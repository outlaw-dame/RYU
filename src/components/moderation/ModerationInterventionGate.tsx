import { useId, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { PolicyDecision } from "../../moderation/policy-types";

export type ModerationInterventionGateProps = {
  decision: PolicyDecision;
  children: ReactNode;
  /** Stable identity for the moderated content version, when the caller has one. */
  contentIdentity?: string;
};

const nodeIds = new WeakMap<object, number>();
let nextNodeId = 1;

function getNodeIdentity(node: ReactNode): string {
  if (node !== null && typeof node === "object") {
    const objectNode = node as object;
    let id = nodeIds.get(objectNode);
    if (!id) {
      id = nextNodeId++;
      nodeIds.set(objectNode, id);
    }
    return `object:${id}`;
  }
  return `${typeof node}:${String(node)}`;
}

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
  const [revealedIdentity, setRevealedIdentity] = useState<string | null>(null);
  const detailsId = useId();
  const gateIdentity = useMemo(() => JSON.stringify({
    action: decision.action,
    collapseSummary: decision.collapseSummary ?? "",
    reasons: decision.reasons,
    matchedFilterIds: decision.matchedFilters.map((filter) => filter.id),
    safetyLabels: decision.safetyLabels.map((label) => `${label.label}:${label.severity}`),
    contentIdentity,
    renderedNode: getNodeIdentity(children)
  }), [children, contentIdentity, decision]);
  const revealed = revealedIdentity === gateIdentity;

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
          onClick={() => setRevealedIdentity(null)}
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
        onClick={() => setRevealedIdentity(gateIdentity)}
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
