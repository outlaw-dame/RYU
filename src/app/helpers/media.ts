/**
 * Phase 23 — Media/cover image utilities extracted from App.tsx.
 *
 * Functions for resolving, proxying, and retrying cover images.
 * All inputs are sanitized before use.
 */

import { sanitizeUrl } from "../../lib/sanitize";

/**
 * Resolve a raw URL to a safe cover image src, optionally proxying
 * cross-origin images. Returns null if the URL is unsafe.
 */
export function resolveCoverProxySrc(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const safeUrl = sanitizeUrl(rawUrl);
  if (!safeUrl) return null;

  const parsed = new URL(safeUrl, window.location.origin);
  if (parsed.origin === window.location.origin) return parsed.toString();
  if (parsed.protocol !== "https:") return null;
  return parsed.toString();
}

/**
 * Retry a failed image load via the media proxy endpoint.
 * Hides the image if the proxy also fails.
 */
export function retryImageViaProxy(event: React.SyntheticEvent<HTMLImageElement>): void {
  const element = event.currentTarget;
  const alreadyRetried = element.dataset.proxyRetry === "1";
  if (alreadyRetried) {
    element.style.display = "none";
    return;
  }

  const currentSrc = element.getAttribute("src");
  const safeSrc = sanitizeUrl(currentSrc);
  if (!safeSrc) {
    element.style.display = "none";
    return;
  }

  const parsed = new URL(safeSrc, window.location.origin);
  if (parsed.origin === window.location.origin || parsed.protocol !== "https:") {
    element.style.display = "none";
    return;
  }

  element.dataset.proxyRetry = "1";
  element.src = `/api/media/cover?url=${encodeURIComponent(parsed.toString())}`;
}
