/**
 * Phase 35 - Moderation engine.
 *
 * Central function that evaluates a status or notification against all
 * moderation rules and returns a decision: show | hide | warn | blur.
 *
 * Checks (in priority order):
 * 1. Account blocks (highest priority - always hide)
 * 2. Domain blocks (always hide)
 * 3. Account mutes (hide from timelines, optionally notifications)
 * 4. Content filters (hide, warn, or blur based on filter config)
 * 5. Safe search / sensitive content (blur or hide based on level)
 * 6. Content warnings from remote posts (warn - show overlay)
 */

import type { ModerationDecision, ModerationResult } from "./types";
import { isBlocked } from "./block-store";
import { isMuted, getMuteEntry } from "./mute-store";
import { isAccountDomainBlocked } from "./domain-block-store";
import { checkContentFilters } from "./content-filter";
import { shouldFilterSensitive, hasContentWarning } from "./safe-search";

/**
 * Input shape for moderation evaluation.
 * Accepts the minimal fields needed from a MastodonStatus or notification.
 */
export type ModerationInput = {
  /** The account ID of the content author. */
  accountId: string;
  /** The account acct string (e.g. "user@instance.tld"). */
  acct?: string;
  /** The text content of the status (HTML stripped or raw). */
  content?: string;
  /** Whether the status is marked sensitive. */
  sensitive?: boolean;
  /** The spoiler/content warning text. */
  spoilerText?: string;
};

/**
 * Context for where the moderation check is happening.
 * Affects how mutes are applied (e.g. notifications vs timeline).
 */
export type ModerationContext = {
  /** The surface being evaluated. */
  surface: "timeline" | "notifications" | "search" | "discovery";
};

/**
 * Evaluate moderation rules for a piece of content.
 *
 * Returns the most restrictive applicable decision.
 */
export function evaluateModeration(
  input: ModerationInput,
  context: ModerationContext = { surface: "timeline" }
): ModerationResult {
  const reasons: string[] = [];

  // 1. Account block - always hide
  if (isBlocked(input.accountId)) {
    return {
      decision: "hide",
      reasons: ["Account is blocked"]
    };
  }

  // 2. Domain block - always hide
  if (isAccountDomainBlocked(input.acct)) {
    return {
      decision: "hide",
      reasons: ["Domain is blocked"]
    };
  }

  // 3. Account mute
  if (isMuted(input.accountId)) {
    const muteEntry = getMuteEntry(input.accountId);
    // For notifications surface, check hideNotifications flag
    if (context.surface === "notifications") {
      if (muteEntry?.hideNotifications) {
        return {
          decision: "hide",
          reasons: ["Account is muted (notifications hidden)"]
        };
      }
      // Muted but notifications are allowed - continue checking other rules
    } else {
      // On all other surfaces, muted accounts are hidden
      return {
        decision: "hide",
        reasons: ["Account is muted"]
      };
    }
  }

  // 4. Content filters (check against content + spoiler text)
  const textToCheck = [input.content ?? "", input.spoilerText ?? ""].join(" ").trim();
  if (textToCheck) {
    const matchedFilter = checkContentFilters(textToCheck);
    if (matchedFilter) {
      const decision: ModerationDecision = matchedFilter.action;
      return {
        decision,
        reasons: [`Content filter matched: "${matchedFilter.phrase}"`],
        matchedFilter
      };
    }
  }

  // 5. Safe search / sensitive content
  if (shouldFilterSensitive(input.sensitive, input.spoilerText)) {
    reasons.push("Content is marked sensitive");
    return {
      decision: "blur",
      reasons
    };
  }

  // 6. Content warnings (always show overlay for CW posts, even with safe search off)
  if (hasContentWarning(input.spoilerText)) {
    return {
      decision: "warn",
      reasons: ["Content has a content warning"]
    };
  }

  // No moderation needed
  return {
    decision: "show",
    reasons: []
  };
}

/**
 * Convenience: check if content should be completely hidden.
 */
export function shouldHideContent(
  input: ModerationInput,
  context?: ModerationContext
): boolean {
  return evaluateModeration(input, context).decision === "hide";
}

/**
 * Convenience: check if content should trigger a warning overlay.
 */
export function shouldWarnContent(
  input: ModerationInput,
  context?: ModerationContext
): boolean {
  const decision = evaluateModeration(input, context).decision;
  return decision === "warn" || decision === "blur";
}
