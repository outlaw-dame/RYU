/**
 * Search/index filtering - moderation enforcement at query time.
 *
 * Blocked/muted/filtered content is excluded before local search ranking.
 * This runs BEFORE scope-filter.ts to remove moderated content early.
 */

import type { PolicyAccount, PolicyDomain, PolicyFilter } from "./policy-types";
import { matchesFilterKeywords, isFilterExpired } from "./policy-engine";
import { isMuteExpired as isMuteExpiredShared, extractDomainFromAcct } from "./shared-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SearchModerationInput = {
  /** The account ID of the content author (if known). */
  accountId?: string;
  /** The account acct string for domain extraction. */
  acct?: string;
  /** The domain of the content source. */
  domain?: string;
  /** Searchable text content. */
  text?: string;
  /** Instance host for federated content. */
  instanceHost?: string;
};

export type SearchModerationState = {
  blockedAccounts: PolicyAccount[];
  mutedAccounts: PolicyAccount[];
  blockedDomains: PolicyDomain[];
  filters: PolicyFilter[];
};

// ─── Core Filter ──────────────────────────────────────────────────────────────

/**
 * Check if a search result should be excluded based on moderation rules.
 *
 * Returns true if the result should be EXCLUDED (hidden).
 */
export function shouldExcludeFromSearch(
  input: SearchModerationInput,
  state: SearchModerationState
): boolean {
  // 1. Blocked account check
  if (input.accountId) {
    const isBlocked = state.blockedAccounts.some(
      (a) => a.accountId === input.accountId && a.action === "block"
    );
    if (isBlocked) return true;
  }

  // 2. Muted account check (excluded from search)
  if (input.accountId) {
    const isMuted = state.mutedAccounts.some(
      (a) => a.accountId === input.accountId && a.action === "mute" && !isMuteExpired(a)
    );
    if (isMuted) return true;
  }

  // 3. Domain block check
  const domain = input.domain ?? input.instanceHost ?? extractDomainFromAcct(input.acct);
  if (domain) {
    const isDomainBlocked = state.blockedDomains.some(
      (d) => d.domain === domain.toLowerCase() &&
        (d.severity === "block" || d.severity === "hide_from_discovery")
    );
    if (isDomainBlocked) return true;
  }

  // 4. Content filter check (only "hide" action filters exclude from search)
  if (input.text) {
    const hideFilters = state.filters.filter(
      (f) => f.action === "hide" &&
        !isFilterExpired(f) &&
        f.contexts.includes("public")
    );

    for (const filter of hideFilters) {
      if (matchesFilterKeywords(input.text, filter)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Filter a list of search results, removing moderated content.
 */
export function filterSearchResults<T extends SearchModerationInput>(
  results: T[],
  state: SearchModerationState
): T[] {
  return results.filter((result) => !shouldExcludeFromSearch(result, state));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isMuteExpired(entry: PolicyAccount): boolean {
  return isMuteExpiredShared(entry);
}
