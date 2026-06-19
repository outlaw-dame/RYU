/**
 * Phase 35 - Domain block store.
 *
 * localStorage-persisted domain/instance block list.
 * All content from blocked domains is hidden from all surfaces.
 */

import type { DomainBlock } from "./types";

const STORAGE_KEY = "ryu:domain-block-list";

/**
 * Load the domain block list from localStorage.
 */
export function loadDomainBlockList(): DomainBlock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DomainBlock[];
  } catch {
    return [];
  }
}

/**
 * Save the domain block list to localStorage.
 */
export function saveDomainBlockList(entries: DomainBlock[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or unavailable; silently fail
  }
}

/**
 * Normalize a domain string: extracts hostname from URLs, account handles, etc.
 * Handles Mastodon profile URLs (https://instance/@user), full URLs,
 * @user@domain handles, and plain domain names.
 */
export function normalizeDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return "";

  // Parse URLs first (before @ splitting) to handle profile URLs like
  // https://mastodon.social/@username correctly.
  if (trimmed.includes("://") || trimmed.startsWith("www.")) {
    try {
      const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
      return url.hostname;
    } catch {
      // Fall through to other strategies
    }
  }

  // Handle @user@domain.com format
  const atParts = trimmed.split("@").filter(Boolean);
  if (atParts.length >= 2) {
    const domain = atParts[atParts.length - 1];
    try {
      return new URL(`https://${domain}`).hostname;
    } catch {
      return domain;
    }
  }

  // Plain domain or hostname
  try {
    const url = new URL(`https://${trimmed}`);
    return url.hostname;
  } catch {
    return trimmed;
  }
}

/**
 * Add a domain block. If already blocked, no-op.
 */
export function addDomainBlock(domain: string, reason?: string): DomainBlock[] {
  const normalized = normalizeDomain(domain);
  const list = loadDomainBlockList();
  const existing = list.find((e) => e.domain === normalized);

  if (existing) return list;

  const entry: DomainBlock = {
    domain: normalized,
    createdAt: new Date().toISOString(),
    reason
  };

  list.push(entry);
  saveDomainBlockList(list);
  return list;
}

/**
 * Remove a domain block.
 */
export function removeDomainBlock(domain: string): DomainBlock[] {
  const normalized = normalizeDomain(domain);
  const list = loadDomainBlockList().filter((e) => e.domain !== normalized);
  saveDomainBlockList(list);
  return list;
}

/**
 * Check if a domain is currently blocked.
 */
export function isDomainBlocked(domain: string): boolean {
  const normalized = normalizeDomain(domain);
  const list = loadDomainBlockList();
  return list.some((e) => e.domain === normalized);
}

/**
 * Extract the domain from an account acct string (e.g. "user@instance.tld" -> "instance.tld").
 * Returns undefined if no domain part is found (local accounts).
 */
export function extractDomain(acct: string | undefined): string | undefined {
  if (!acct) return undefined;
  const parts = acct.split("@");
  // "user@domain" or "@user@domain"
  const domain = parts.length >= 2 ? parts[parts.length - 1] : undefined;
  return domain ? normalizeDomain(domain) : undefined;
}

/**
 * Check if an account's domain is blocked based on acct string.
 */
export function isAccountDomainBlocked(acct: string | undefined): boolean {
  const domain = extractDomain(acct);
  if (!domain) return false;
  return isDomainBlocked(domain);
}
