import { stripHtml } from "../lib/sanitize";
import { evaluatePolicy, type PolicyInput, type PolicyStoreState } from "./policy-engine";
import type { PolicyDecision, PolicyEvaluationContext } from "./policy-types";

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
};

export type PolicySurfaceResult<T> = {
  item: T;
  decision: PolicyDecision;
  hidden: boolean;
  requiresIntervention: boolean;
};

function normalizedText(value: unknown, maxLength = 20_000): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = stripHtml(value).trim();
  return text ? text.slice(0, maxLength) : undefined;
}

export function statusToPolicyInput(status: ModeratableStatus): PolicyInput | null {
  const accountId = status.account?.id?.trim();
  if (!accountId || accountId.length > 2_048) return null;

  const acct = normalizedText(status.account.acct, 512);
  const authorName = normalizedText(
    status.account.display_name || status.account.username,
    512
  );

  return {
    accountId,
    acct,
    content: normalizedText(status.content),
    sensitive: status.sensitive === true,
    spoilerText: normalizedText(status.spoiler_text, 4_096),
    authorName
  };
}

export function evaluateStatusForSurface<T extends ModeratableStatus>(
  status: T,
  state: PolicyStoreState,
  context: PolicyEvaluationContext
): PolicySurfaceResult<T> {
  const input = statusToPolicyInput(status);
  const decision = input
    ? evaluatePolicy(input, state, context)
    : {
        action: "hide" as const,
        reasons: ["Invalid content identity"],
        matchedFilters: [],
        safetyLabels: []
      };

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
