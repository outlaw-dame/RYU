import type { MastodonSessionState } from "../sync/mastodon-activity-api";

const MAX_OWNER_ID_LENGTH = 512;

/**
 * Build the canonical local moderation owner identity from authenticated
 * server-session data. Instance origin is mandatory to prevent accounts with
 * the same local username on different servers from sharing policies.
 */
export function buildModerationOwnerIdentity(
  session: MastodonSessionState | null | undefined
): string | null {
  if (!session?.connected || !session.instanceOrigin || !session.account) return null;

  let instanceOrigin: string;
  try {
    const url = new URL(session.instanceOrigin);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) {
      return null;
    }
    instanceOrigin = url.origin.toLowerCase();
  } catch {
    return null;
  }

  const accountIdentity = (session.account.id || session.account.acct || "").trim();
  if (!accountIdentity) return null;

  const owner = `${instanceOrigin}#${accountIdentity}`;
  return owner.length <= MAX_OWNER_ID_LENGTH ? owner : null;
}

function isLoopback(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]";
}
