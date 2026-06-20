/**
 * Policy engine - unified moderation evaluation.
 *
 * Normalizes Mastodon filters, mutes, blocks, relationships, reports, and
 * preferences into one RYU policy model. Applies policy consistently across
 * timelines, search, discovery, reviews, notifications, profiles, and
 * BookTok/now-reading feeds.
 *
 * Integrates semantic keyword filtering, BookWyrm spoiler support, and
 * recommendation/trust controls for comprehensive moderation.
 */

import type {
  FilterContext,
  PolicyFilter,
  PolicyAccount,
  PolicyDomain,
  PolicyRelationship,
  PolicyDecision,
  PolicyEvaluationContext,
  SafetyLabel,
  BookSafetyLabel,
  LabelSeverity
} from "./policy-types";
import { buildKeywordRegex } from "./keyword-utils";
import { isMuteExpired as isMuteExpiredShared, extractDomainFromAcct } from "./shared-utils";
import { evaluateSpoiler, createLocalStorageReadingStatusLookup } from "./spoiler-engine";
import type { ReadingStatusLookup, SpoilerPreferences } from "./spoiler-engine";
import { isSuppressed } from "./trust-controls";
import type { SuppressionType } from "./trust-controls";

// ─── Input Types ──────────────────────────────────────────────────────────────

export type PolicyInput = {
  /** The account ID of the content author. */
  accountId: string;
  /** The account acct string (e.g. "user@instance.tld"). */
  acct?: string;
  /** The text content (HTML stripped or raw). */
  content?: string;
  /** Whether the content is marked sensitive. */
  sensitive?: boolean;
  /** The spoiler/content warning text. */
  spoilerText?: string;
  /** Domain of the content author. */
  domain?: string;
  /** Safety labels already applied to this content. */
  safetyLabels?: SafetyLabel[];
  /** Author name (for suppression checks). */
  authorName?: string;
  /** Work/book title (for suppression checks). */
  workTitle?: string;
};

export type PolicyStoreState = {
  accounts: PolicyAccount[];
  domains: PolicyDomain[];
  filters: PolicyFilter[];
  relationships: PolicyRelationship[];
};

// ─── Keyword Matching ─────────────────────────────────────────────────────────

/**
 * Build a regex for a keyword with optional whole-word matching.
 * Delegates to shared keyword-utils for CJK-aware boundary logic.
 */
function buildKeywordPattern(keyword: string, wholeWord: boolean): RegExp {
  return buildKeywordRegex(keyword, wholeWord);
}

/**
 * Test if text matches any keyword in a filter.
 */
export function matchesFilterKeywords(text: string, filter: PolicyFilter): boolean {
  if (!text) return false;
  if (isFilterExpired(filter)) return false;

  for (const kw of filter.keywords) {
    const pattern = buildKeywordPattern(kw.keyword, kw.wholeWord);
    if (pattern.test(text)) return true;
  }
  return false;
}

/**
 * Check if a filter has expired.
 */
export function isFilterExpired(filter: PolicyFilter): boolean {
  if (!filter.expiresAt) return false;
  return Date.now() > Date.parse(filter.expiresAt);
}

// ─── Context Mapping ──────────────────────────────────────────────────────────

/**
 * Map a policy evaluation context surface to Mastodon filter contexts.
 */
function surfaceToFilterContexts(surface: PolicyEvaluationContext["surface"]): FilterContext[] {
  switch (surface) {
    case "home":
      return ["home"];
    case "notifications":
      return ["notifications"];
    case "public":
    case "search":
    case "discovery":
    case "booktok":
    case "now_reading":
      return ["public"];
    case "thread":
      return ["thread"];
    case "account":
      return ["account"];
    default:
      return ["public"];
  }
}

// ─── Domain Extraction ────────────────────────────────────────────────────────

// extractDomainFromAcct imported from ./shared-utils

// ─── Policy Evaluation ────────────────────────────────────────────────────────

/**
 * Evaluate all moderation policies for a piece of content.
 *
 * Checks (in priority order):
 * 1. Account blocks (highest priority - always hide)
 * 2. Domain blocks (always hide)
 * 3. Account mutes (hide or collapse based on surface)
 * 4. Keyword filters (by context, with action: hide/warn/blur)
 * 5. Safety labels (RYU-native book content labels)
 * 6. Sensitive content (blur if marked sensitive)
 */
export function evaluatePolicy(
  input: PolicyInput,
  state: PolicyStoreState,
  context: PolicyEvaluationContext
): PolicyDecision {
  const reasons: string[] = [];
  const matchedFilters: PolicyFilter[] = [];
  const safetyLabels: SafetyLabel[] = input.safetyLabels ?? [];

  // 1. Account block check
  const blocked = state.accounts.find(
    (a) => a.accountId === input.accountId && a.action === "block"
  );
  if (blocked) {
    return {
      action: "hide",
      reasons: ["Account is blocked"],
      matchedFilters: [],
      safetyLabels
    };
  }

  // Also check relationship-based blocking
  const relationship = state.relationships.find((r) => r.accountId === input.accountId);
  if (relationship?.blocking) {
    return {
      action: "hide",
      reasons: ["Account is blocked (via relationship)"],
      matchedFilters: [],
      safetyLabels
    };
  }

  // 2. Domain block check
  const domain = input.domain ?? extractDomainFromAcct(input.acct);

  // Domain-level relationship blocking (check regardless of whether domain is resolved)
  if (relationship?.domainBlocking) {
    return {
      action: "hide",
      reasons: ["Domain is blocked (via relationship)"],
      matchedFilters: [],
      safetyLabels
    };
  }

  if (domain) {
    const domainBlocked = state.domains.find(
      (d) => d.domain === domain && d.severity === "block"
    );
    if (domainBlocked) {
      return {
        action: "hide",
        reasons: ["Domain is blocked"],
        matchedFilters: [],
        safetyLabels
      };
    }

    // Hide from discovery/search
    const domainHidden = state.domains.find(
      (d) => d.domain === domain && d.severity === "hide_from_discovery"
    );
    if (domainHidden && (context.surface === "search" || context.surface === "discovery")) {
      return {
        action: "hide",
        reasons: ["Domain is hidden from discovery"],
        matchedFilters: [],
        safetyLabels
      };
    }
  }

  // 3. Account mute check
  const muted = state.accounts.find(
    (a) => a.accountId === input.accountId && a.action === "mute" && !isMuteExpired(a)
  );

  // Check relationship muting, but also verify mute hasn't expired
  const isRelationshipMuteActive = relationship?.muting &&
    (!relationship.mutingExpiresAt || Date.now() < Date.parse(relationship.mutingExpiresAt));

  if (muted || isRelationshipMuteActive) {
    const muteEntry = muted;
    if (context.surface === "notifications") {
      const hideNotif = muteEntry?.hideNotifications ?? relationship?.mutingNotifications ?? true;
      if (hideNotif) {
        return {
          action: "hide",
          reasons: ["Account is muted (notifications hidden)"],
          matchedFilters: [],
          safetyLabels
        };
      }
    } else {
      return {
        action: "collapse",
        reasons: ["Account is muted"],
        matchedFilters: [],
        safetyLabels,
        collapseSummary: "Content from a muted account"
      };
    }
  }

  // 4. Keyword filter check (context-aware)
  const applicableContexts = surfaceToFilterContexts(context.surface);
  const textToCheck = [input.content ?? "", input.spoilerText ?? ""].join(" ").trim();

  if (textToCheck) {
    const activeFilters = state.filters.filter(
      (f) => !isFilterExpired(f) && f.contexts.some((c) => applicableContexts.includes(c))
    );

    // Sort by action priority: hide > warn > blur
    const actionPriority: Record<string, number> = { hide: 3, warn: 2, blur: 1 };
    let bestAction: PolicyDecision["action"] = "show";
    let bestPriority = 0;

    for (const filter of activeFilters) {
      if (matchesFilterKeywords(textToCheck, filter)) {
        matchedFilters.push(filter);
        const priority = actionPriority[filter.action] ?? 0;
        if (priority > bestPriority) {
          bestAction = filter.action;
          bestPriority = priority;
          reasons.push(`Filter matched: "${filter.title}"`);
        }
      }
    }

    if (bestAction !== "show") {
      return { action: bestAction, reasons, matchedFilters, safetyLabels };
    }
  }

  // 5. Suppression checks (author/work/entity)
  if (input.authorName && isSuppressed("author", input.authorName)) {
    return {
      action: "hide",
      reasons: [`Author is suppressed: "${input.authorName}"`],
      matchedFilters,
      safetyLabels
    };
  }
  if (input.workTitle && isSuppressed("work", input.workTitle)) {
    return {
      action: "hide",
      reasons: [`Work is suppressed: "${input.workTitle}"`],
      matchedFilters,
      safetyLabels
    };
  }

  // 6. Safety labels check
  if (safetyLabels.length > 0) {
    const highSeverity = safetyLabels.find((l) => l.severity === "hide");
    if (highSeverity) {
      return {
        action: "hide",
        reasons: [`Safety label: ${highSeverity.label}`],
        matchedFilters,
        safetyLabels
      };
    }

    const warnSeverity = safetyLabels.find((l) => l.severity === "warn");
    if (warnSeverity) {
      return {
        action: "warn",
        reasons: [`Safety label: ${warnSeverity.label}`],
        matchedFilters,
        safetyLabels
      };
    }
  }

  // 7. Sensitive content
  if (input.sensitive) {
    return {
      action: "blur",
      reasons: ["Content is marked sensitive"],
      matchedFilters,
      safetyLabels
    };
  }

  // 8. BookWyrm spoiler / content warning evaluation
  if (input.spoilerText && input.spoilerText.trim().length > 0) {
    const spoilerResult = evaluateSpoilerForPolicy(input.spoilerText);
    if (spoilerResult.shouldEnforce) {
      return {
        action: "collapse",
        reasons: [spoilerResult.reason],
        matchedFilters,
        safetyLabels,
        collapseSummary: input.spoilerText
      };
    }
    // If spoiler is not enforced (e.g. book already read), show normally
    if (spoilerResult.isBookSpoiler && !spoilerResult.shouldEnforce) {
      return { action: "show", reasons: [spoilerResult.reason], matchedFilters, safetyLabels };
    }
    // Generic CW that is not enforced - still show the warning
    if (spoilerResult.isGenericCW && !spoilerResult.shouldEnforce) {
      return {
        action: "warn",
        reasons: ["Content has a content warning"],
        matchedFilters,
        safetyLabels
      };
    }
    // Unrecognized CW that is not enforced
    return {
      action: "warn",
      reasons: ["Content has a content warning"],
      matchedFilters,
      safetyLabels
    };
  }

  return { action: "show", reasons: [], matchedFilters, safetyLabels };
}

// ─── Spoiler Policy Helper ────────────────────────────────────────────────────

/**
 * Evaluate spoiler text for policy decisions.
 * Uses localStorage-based reading status lookup.
 */
function evaluateSpoilerForPolicy(spoilerText: string) {
  const lookup = createLocalStorageReadingStatusLookup();
  return evaluateSpoiler(spoilerText, lookup);
}

/**
 * Check if a mute entry has expired.
 */
function isMuteExpired(entry: PolicyAccount): boolean {
  return isMuteExpiredShared(entry);
}

// ─── Safety Label Helpers ─────────────────────────────────────────────────────

/**
 * Create a safety label.
 */
export function createSafetyLabel(
  label: BookSafetyLabel,
  severity: LabelSeverity,
  confidence: number,
  source: SafetyLabel["source"] = "automatic",
  note?: string
): SafetyLabel {
  return { label, severity, confidence, source, note };
}

/**
 * Book safety label definitions with default severities.
 */
export const BOOK_SAFETY_LABELS: Record<BookSafetyLabel, { name: string; defaultSeverity: LabelSeverity }> = {
  spoiler: { name: "Spoiler", defaultSeverity: "warn" },
  explicit_sexual: { name: "Explicit Sexual Content", defaultSeverity: "warn" },
  graphic_violence: { name: "Graphic Violence", defaultSeverity: "warn" },
  abuse_harassment: { name: "Abuse/Harassment", defaultSeverity: "hide" },
  hate: { name: "Hate", defaultSeverity: "hide" },
  spam_scam: { name: "Spam/Scam", defaultSeverity: "hide" },
  ai_generated_slop: { name: "AI-Generated Slop", defaultSeverity: "inform" },
  review_bombing: { name: "Review Bombing", defaultSeverity: "warn" },
  unsafe_links: { name: "Unsafe Links", defaultSeverity: "hide" }
};

// ─── Normalize from Mastodon ──────────────────────────────────────────────────

/**
 * Convert a Mastodon v2 filter API response to a PolicyFilter.
 */
export function normalizeMastodonFilter(raw: {
  id: string;
  title: string;
  keywords: Array<{ id: string; keyword: string; whole_word: boolean }>;
  context: string[];
  filter_action: string;
  expires_at: string | null;
}, instanceOrigin: string, accountId: string): PolicyFilter {
  const validContexts: FilterContext[] = ["home", "notifications", "public", "thread", "account"];

  return {
    id: `remote:${instanceOrigin}:${raw.id}`,
    title: raw.title,
    keywords: raw.keywords.map((kw) => ({
      id: kw.id,
      keyword: kw.keyword,
      wholeWord: kw.whole_word
    })),
    contexts: raw.context.filter((c): c is FilterContext => validContexts.includes(c as FilterContext)),
    action: normalizeFilterAction(raw.filter_action),
    expiresAt: raw.expires_at,
    source: "remote",
    remoteId: raw.id,
    instanceOrigin,
    accountId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Normalize filter_action string to a PolicyFilterAction.
 * Accepts "blur" in addition to "warn" and "hide" (Mastodon compatibility).
 */
function normalizeFilterAction(action: string): PolicyDecision["action"] & ("warn" | "hide" | "blur") {
  switch (action) {
    case "hide": return "hide";
    case "blur": return "blur";
    case "warn": return "warn";
    default: return "warn";
  }
}

/**
 * Normalize a Mastodon relationship API response to a PolicyRelationship.
 */
export function normalizeMastodonRelationship(raw: {
  id: string;
  following: boolean;
  followed_by: boolean;
  blocking: boolean;
  blocked_by: boolean;
  muting: boolean;
  muting_notifications: boolean;
  requested: boolean;
  requested_by?: boolean;
  domain_blocking: boolean;
  endorsed: boolean;
  note?: string;
  muting_expires_at?: string | null;
}, instanceOrigin: string, ownerAccountId: string): PolicyRelationship {
  return {
    id: `rel:${instanceOrigin}:${raw.id}`,
    accountId: raw.id,
    following: raw.following,
    followedBy: raw.followed_by,
    blocking: raw.blocking,
    blockedBy: raw.blocked_by,
    muting: raw.muting,
    mutingNotifications: raw.muting_notifications,
    requested: raw.requested,
    requestedBy: raw.requested_by ?? false,
    domainBlocking: raw.domain_blocking,
    endorsed: raw.endorsed,
    note: raw.note,
    mutingExpiresAt: raw.muting_expires_at ?? null,
    instanceOrigin,
    ownerAccountId,
    syncedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
