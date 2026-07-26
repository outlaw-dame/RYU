/**
 * Explanation trace — converts a scored recommendation's score trace
 * into human-readable explanation lines for the "Why am I seeing this?" UI.
 */

import type { ScoredRecommendation, ScoreContribution } from "./unified-scorer";
import type { SignalEntityType, SignalKind } from "./signal-types";

export interface ExplanationLine {
  /** Human-readable label for this explanation line. */
  label: string;
  /** Whether this is a positive (green) or negative (red) indicator. */
  positive: boolean;
  /** Whether the user can edit/toggle the underlying signal. */
  editable: boolean;
  /** Signal ID if this line corresponds to a user-editable signal. */
  signalId?: string;
  /** Entity type if applicable. */
  entityType?: SignalEntityType;
  /** Entity ID if applicable. */
  entityId?: string;
  /** Signal kind if applicable. */
  kind?: SignalKind;
}

/**
 * Map a contribution kind to signal kind for editability tracking.
 */
function inferSignalKind(contribution: ScoreContribution): SignalKind | undefined {
  const label = contribution.label.toLowerCase();
  if (label.includes("show more")) return "show_more";
  if (label.includes("show less")) return "show_less";
  if (label.includes("preferred")) return "prefer";
  if (label.includes("suppress")) return "suppress";
  return undefined;
}

/**
 * Build a human-readable explanation from a scored recommendation's trace.
 *
 * Each contribution in the score trace becomes an ExplanationLine with:
 * - positive: true for boosts, false for penalties/suppressions
 * - editable: true if the user can change the underlying signal
 * - signalId: present for signal-based contributions
 */
export function buildExplanation(scored: ScoredRecommendation): ExplanationLine[] {
  const { scoreTrace } = scored;
  const lines: ExplanationLine[] = [];

  for (const contribution of scoreTrace.contributions) {
    // Skip the base score — it's implicit
    if (contribution.kind === "base") {
      lines.push({
        label: `Base score: ${scoreTrace.baseScore.toFixed(2)}`,
        positive: scoreTrace.baseScore > 0,
        editable: false
      });
      continue;
    }

    const positive = contribution.delta >= 0 && contribution.kind !== "suppression";
    const editable = contribution.kind === "signal_boost" ||
      contribution.kind === "signal_penalty" ||
      contribution.kind === "suppression";

    const signalKind = inferSignalKind(contribution);

    lines.push({
      label: contribution.label,
      positive,
      editable,
      signalId: contribution.signalId,
      entityType: scored.entityType as SignalEntityType,
      entityId: scored.id,
      kind: signalKind
    });
  }

  return lines;
}
