/**
 * Shared keyword-matching utilities for moderation filters.
 *
 * Used by policy-engine, content-filter, and search-moderation-filter
 * to avoid duplicating CJK-aware word boundary logic.
 */

/**
 * Check if text contains non-ASCII word characters that \b cannot handle.
 */
export function hasNonAsciiWordChars(text: string): boolean {
  return /[^\x00-\x7F]/.test(text);
}

/**
 * Check if a keyword/phrase consists entirely of CJK ideographs (Han/Katakana script).
 */
export function isCjkText(text: string): boolean {
  return /^[\p{Script=Han}\p{Script=Katakana}]+$/u.test(text);
}

/**
 * Build a regex pattern for a keyword/phrase with optional whole-word matching.
 * Handles non-ASCII with Unicode property escapes.
 *
 * For CJK ideographs: match when not directly adjacent to other Han/Katakana
 * ideographs (since CJK languages do not use spaces for word separation,
 * kana/particles are valid boundaries).
 * For other non-ASCII: use Unicode letter/number boundaries.
 */
export function buildKeywordRegex(keyword: string, wholeWord: boolean): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (!wholeWord) {
    return new RegExp(escaped, "iu");
  }

  if (isCjkText(keyword)) {
    const pattern = `(?<![\\p{Script=Han}\\p{Script=Katakana}])${escaped}(?![\\p{Script=Han}\\p{Script=Katakana}])`;
    return new RegExp(pattern, "iu");
  }

  if (hasNonAsciiWordChars(keyword)) {
    const pattern = `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`;
    return new RegExp(pattern, "iu");
  }

  return new RegExp(`\\b${escaped}\\b`, "iu");
}
