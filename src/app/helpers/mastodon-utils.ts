/**
 * Phase 23 — Mastodon/Fediverse display utilities extracted from App.tsx.
 *
 * Pure functions for rendering account labels, status text, initials,
 * and other presentation concerns for Mastodon content. These do NOT
 * fetch data — they only transform it for display.
 */

import { sanitizeUrl, stripHtml } from "../../lib/sanitize";
import type { MastodonStatus, MastodonAccountFull } from "../../sync/mastodon-client";

/**
 * Get the best display label for a Mastodon account.
 */
export function mastodonAccountLabel(account: MastodonStatus["account"]): string {
  return account.display_name || account.acct || account.username || "Unknown account";
}

/**
 * Extract text content from a Mastodon status (strip HTML, normalize whitespace).
 */
export function mastodonStatusText(status: MastodonStatus): string {
  const normalizedHtml = (status.content ?? "")
    .replace(/<span[^>]*class="[^"]*invisible[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|blockquote|h[1-6])>/gi, "\n");
  const text = stripHtml(normalizedHtml)
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (text) return text;
  if (status.spoiler_text) return status.spoiler_text;
  return "Updated their reading activity.";
}

/**
 * Compute 1-2 character initials from an account.
 */
export function accountInitials(account: MastodonStatus["account"]): string {
  const label = mastodonAccountLabel(account).replace(/^@/, "").trim();
  const initials = label
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return initials || "RY";
}

/**
 * Build an external profile URL from account data.
 */
export function buildAccountProfileHref(account: MastodonStatus["account"]): string | null {
  const direct = sanitizeUrl(account.url ?? null);
  if (direct) return direct;

  const acct = (account.acct || "").trim();
  const username = (account.username || "").trim();
  const parts = acct.split("@").filter(Boolean);
  if (parts.length >= 2) {
    const domain = parts[parts.length - 1]!;
    const user = username || parts[0]!;
    if (domain && user) return `https://${domain}/@${encodeURIComponent(user)}`;
  }
  return null;
}

/**
 * Extract the instance origin from an account (e.g., "https://bookwyrm.social").
 */
export function accountInstanceOrigin(account: MastodonStatus["account"]): string | null {
  const direct = sanitizeUrl(account.url ?? null);
  if (direct) {
    try {
      const parsed = new URL(direct);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      // ignore malformed url
    }
  }
  const acct = (account.acct || "").trim();
  const parts = acct.split("@").filter(Boolean);
  if (parts.length >= 2) {
    return sanitizeUrl(`https://${parts[parts.length - 1]}`);
  }
  return null;
}

/**
 * Extract bio text from a status account.
 */
export function accountBio(account: MastodonStatus["account"]): string | null {
  const record = account as unknown as Record<string, unknown>;
  const note = typeof record.note === "string" ? stripHtml(record.note).trim() : "";
  if (note) return note;
  const summary = typeof record.summary === "string" ? stripHtml(record.summary).trim() : "";
  return summary || null;
}

/**
 * Extract bio text from a full Mastodon profile.
 */
export function profileBio(profile: MastodonAccountFull): string | null {
  const direct = typeof profile.note === "string" ? stripHtml(profile.note).trim() : "";
  if (direct) return direct;
  const sourceNote = profile.source && typeof profile.source.note === "string"
    ? stripHtml(profile.source.note).trim()
    : "";
  return sourceNote || null;
}

/**
 * Build a join date label from a profile.
 */
export function profileJoinDateLabel(profile: MastodonAccountFull): string | null {
  if (!profile.created_at) return null;
  return formatFullDateInternal(profile.created_at);
}

/**
 * Build hashtag URL on an instance.
 */
export function mastodonHashtagUrl(tag: string, instanceOrigin?: string | null): string {
  const safeBase = sanitizeUrl(instanceOrigin ?? null) ?? "https://mastodon.social";
  return `${safeBase.replace(/\/$/, "")}/tags/${encodeURIComponent(tag.replace(/^#/, ""))}`;
}

/**
 * Get the unique account key for a status.
 */
export function statusAccountKey(status: MastodonStatus): string {
  return (status.account.acct || status.account.id || status.account.username || "unknown").toLowerCase();
}

/**
 * Get hashtags from a status.
 */
export function statusHashtags(status: MastodonStatus): string[] {
  const record = status as unknown as Record<string, unknown>;
  const rawTags = Array.isArray(record.tags) ? record.tags as unknown[] : [];
  return rawTags
    .map((tag) => {
      const tagRecord = tag && typeof tag === "object" ? tag as Record<string, unknown> : null;
      if (!tagRecord || typeof tagRecord.name !== "string") return null;
      const name = tagRecord.name.trim().replace(/^#/, "");
      return name ? name.toLowerCase() : null;
    })
    .filter((value): value is string => Boolean(value));
}

/**
 * Check if granted scopes include write access to a given scope.
 */
export function hasWriteScope(scopes: string[] | undefined, target: string): boolean {
  if (!scopes || scopes.length === 0) return false;
  return scopes.includes(target) || scopes.includes("write");
}

// Internal helper (avoids circular dep with formatters module)
function formatFullDateInternal(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
}
