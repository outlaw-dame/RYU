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
 * Normalize a domain string (lowercase, trim whitespace).
 */
export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
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
 * Extract the domain from an account acct string or profile URL.
 *
 * Handles:
 * - "user@instance.tld" -> "instance.tld"
 * - "@user@instance.tld" -> "instance.tld"
 * - "https://instance.tld/@user" -> "instance.tld"
 * - Non-http URLs with "://" are parsed as-is (e.g. "ftp://host.tld/path")
 * - Profile URLs without protocol that contain "/@" (e.g. "instance.tld/@user")
 *
 * Returns undefined if no domain part is found (local accounts).
 */
export function extractDomain(acct: string | undefined): string | undefined {
  if (!acct) return undefined;

  const trimmed = acct.trim();

  // Handle URLs with any protocol scheme (contains "://")
  if (trimmed.includes("://")) {
    try {
      const parsed = new URL(trimmed);
      return parsed.hostname ? normalizeDomain(parsed.hostname) : undefined;
    } catch {
      return undefined;
    }
  }

  // Handle profile URLs without protocol that contain "/@"
  if (trimmed.includes("/@")) {
    const hostPart = trimmed.split("/@")[0];
    if (hostPart && !hostPart.includes(" ") && hostPart.includes(".")) {
      return normalizeDomain(hostPart);
    }
  }

  const parts = trimmed.split("@");
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
