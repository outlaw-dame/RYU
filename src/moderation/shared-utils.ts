/**
 * Shared moderation utilities.
 *
 * Common helpers used across policy-engine, search-moderation-filter,
 * and notification-filter to avoid code duplication.
 */

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
  if (!acct) return undefined;
  const trimmed = acct.trim();

  if (trimmed.includes("://")) {
    try {
      const parsed = new URL(trimmed);
      return parsed.hostname?.toLowerCase() || undefined;
    } catch {
      return undefined;
    }
  }

  if (trimmed.includes("/@")) {
    const hostPart = trimmed.split("/@")[0];
    if (hostPart && !hostPart.includes(" ") && hostPart.includes(".")) {
      return hostPart.toLowerCase();
    }
  }

  const parts = trimmed.split("@");
  // "@user" (local) has parts ["", "user"] — only extract domain if
  // there are at least 3 parts for @-prefixed or 2 for unprefixed
  const isPrefixed = trimmed.startsWith("@");
  const hasDomain = isPrefixed ? parts.length >= 3 : parts.length >= 2;
  const domain = hasDomain ? parts[parts.length - 1] : undefined;
  return domain?.toLowerCase() || undefined;
}
