/**
 * Shared moderation utilities.
 *
 * Common helpers used across policy-engine, search-moderation-filter,
 * and notification-filter to avoid code duplication.
 */

import { extractDomain } from "./domain-block-store";

/**
 * Check if a mute entry has expired based on its expiresAt field.
 */
export function isMuteExpired(entry: { expiresAt: string | null | undefined }): boolean {
  if (!entry.expiresAt) return false;
  return Date.now() > Date.parse(entry.expiresAt);
}

/**
 * Extract domain from an acct string (e.g. "user@instance.tld" -> "instance.tld").
 * Handles various formats: plain acct, URLs, and WebFinger-style paths.
 */
export function extractDomainFromAcct(acct: string | undefined): string | undefined {
  return extractDomain(acct);
}
