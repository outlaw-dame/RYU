import { stripHtml } from "../lib/sanitize";
import { evaluatePolicy, type PolicyInput, type PolicyStoreState } from "./policy-engine";
import type { PolicyDecision, PolicyEvaluationContext } from "./policy-types";

const MAX_ACCOUNT_ID_LENGTH = 2_048;
const MAX_CONTENT_LENGTH = 20_000;
const MAX_ACCT_LENGTH = 512;
const MAX_AUTHOR_NAME_LENGTH = 512;
const MAX_SPOILER_LENGTH = 4_096;

export type ModeratableStatus = {
  account: {
    id: string;
    acct?: string;
    display_name?: string;
    username?: string;
  };
  content?: string;
  sensitive?: boolean;
  spoiler_text?: string;
  reblog?: ModeratableStatus | null;
};

export type PolicySurfaceResult<T> = {
  item: T;
  decision: PolicyDecision;
  hidden: boolean;
  requiresIntervention: boolean;
};

const ACTION_PRIORITY: Record<PolicyDecision["action"], number> = {
  show: 0,
  collapse: 1,
  blur: 2,
  warn: 3,
  hide: 4
};

function stripHtmlPreservingBoundaries(value: string): string {
  const withBoundaries = value
    .replace(/<(?:br|hr)\b[^>]*>/gi, " ")
    .replace(/<\/(?:address|article|aside|blockquote|div|dl|fieldset|figcaption|figure|footer|form|h[1-6]|header|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)>/gi, " ");
  return stripHtml(withBoundaries).replace(/\s+/g, " ").trim();
}

function normalizedText(value: unknown, maxLength: number): string | undefined | null {
  if (typeof value !== "string") return undefined;
  const text = stripHtmlPreservingBoundaries(value);
  if (!text) return undefined;
  return text.length <= maxLength ? text : null;
}

export function statusToPolicyInput(status: ModeratableStatus): PolicyInput | null {
  const accountId = status.account?.id?.trim();
  if (!accountId || accountId.length > MAX_ACCOUNT_ID_LENGTH) return null;

  const acct = normalizedText(status.account.acct, MAX_ACCT_LENGTH);
  const authorName = normalizedText(
    status.account.display_name || status.account.username,
    MAX_AUTHOR_NAME_LENGTH
  );
  const content = normalizedText(status.content, MAX_CONTENT_LENGTH);
  const spoilerText = normalizedText(status.spoiler_text, MAX_SPOILER_LENGTH);

  // Oversized federated content must not be partially moderated. A null value
  // means normalization rejected the field, while undefined means it was absent.
  if (acct === null || authorName === null || content === null || spoilerText === null) {
    return null;
  }

  return {
    accountId,
    acct,
    content,
    sensitive: status.sensitive === true,
    spoilerText,
    authorName
  };
}

function invalidDecision(reason: string): PolicyDecision {
  return {
    action: "hide",
    reasons: [reason],
    matchedFilters: [],
    safetyLabels: []
  };
}

function mergeDecisions(decisions: readonly PolicyDecision[]): PolicyDecision {
  const strongest = decisions.reduce((current, candidate) =>
    ACTION_PRIORITY[candidate.action] > ACTION_PRIORITY[current.action] ? candidate : current
  );

  return {
    action: strongest.action,
    reasons: [...new Set(decisions.flatMap((decision) => decision.reasons))],
    matchedFilters: [...new Set(decisions.flatMap((decision) => decision.matchedFilters))],
    safetyLabels: [...new Set(decisions.flatMap((decision) => decision.safetyLabels))]
  };
}

function evaluateOne(
  status: ModeratableStatus,
  state: PolicyStoreState,
  context: PolicyEvaluationContext
): PolicyDecision {
  const input = statusToPolicyInput(status);
  return input
    ? evaluatePolicy(input, state, context)
    : invalidDecision("Invalid or oversized content identity");
}

export function evaluateStatusForSurface<T extends ModeratableStatus>(
  status: T,
  state: PolicyStoreState,
  context: PolicyEvaluationContext
): PolicySurfaceResult<T> {
  // A boost has two independently moderatable actors: the booster and the
  // original author. Evaluate both and apply the strongest decision so neither
  // wrapper metadata nor nested content can bypass policy.
  const decisions = [evaluateOne(status, state, context)];
  if (status.reblog) decisions.push(evaluateOne(status.reblog, state, context));
  const decision = mergeDecisions(decisions);

  return Object.freeze({
    item: status,
    decision,
    hidden: decision.action === "hide",
    requiresIntervention: decision.action !== "show"
  });
}

export function applyPolicyToSurface<T extends ModeratableStatus>(
  items: readonly T[],
  state: PolicyStoreState,
  context: PolicyEvaluationContext
): PolicySurfaceResult<T>[] {
  if (items.length > 5_000) {
    throw new RangeError("Moderation batch exceeds the supported limit");
  }

  return items.map((item) => evaluateStatusForSurface(item, state, context));
}
