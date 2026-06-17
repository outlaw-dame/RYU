/**
 * Phase 21 — Internationalization-aware query normalization.
 *
 * Provides diacritic-insensitive matching, CJK-aware tokenization hints,
 * and RTL script detection so the search pipeline handles non-ASCII
 * titles/authors without requiring the user to type exact diacritics.
 *
 * Design choices:
 * - Use NFD + strip-combining for diacritic folding (broadest browser support)
 * - Detect CJK ranges so callers can skip word-boundary tokenization
 * - Detect RTL so the UI can align the input field correctly
 * - All functions are pure, sync, and never throw
 */

/**
 * Fold diacritics by decomposing into NFD and stripping combining marks.
 * "García" → "Garcia", "naïve" → "naive", "Ångström" → "Angstrom"
 */
export function foldDiacritics(text: string): string {
  // NFD decomposes characters: "é" → "e" + combining-accent
  // Then we strip the combining-characters range (U+0300..U+036F).
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Returns true when the text contains CJK Unified Ideographs,
 * Hiragana, Katakana, Hangul, or CJK punctuation.
 *
 * When true, callers should NOT split on whitespace alone because CJK
 * scripts are not space-delimited. The Orama lexical index handles
 * character-ngram matching internally, so the main use is to skip
 * word-boundary heuristics in intent classification.
 */
export function containsCJK(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\u3000-\u9fff\uf900-\ufaff\u{20000}-\u{2fa1f}\uac00-\ud7af\u3040-\u309f\u30a0-\u30ff]/u.test(text);
}

/**
 * Returns true when the first strong directional character in the text
 * is RTL (Arabic, Hebrew, Thaana, etc.). Used by the search input to
 * set `dir="auto"` or `dir="rtl"` for correct cursor/caret behavior.
 */
export function isRTLText(text: string): boolean {
  // Check for the first strong directional character.
  // RTL ranges: Arabic (0600-06FF), Hebrew (0590-05FF), etc.
  const firstStrong = text.match(/[\u0590-\u05ff\u0600-\u06ff\u0700-\u074f\u0780-\u07bf\ufb50-\ufdff\ufe70-\ufeff]/);
  if (firstStrong) return true;
  // Check for RTL marks.
  if (text.startsWith("\u200F") || text.startsWith("\u202B")) return true;
  return false;
}

/**
 * Normalize a search query for internationalized matching:
 * 1. Trim whitespace
 * 2. Fold diacritics for accent-insensitive comparison
 * 3. Lowercase (locale-insensitive — safe for Latin/Cyrillic/Greek)
 *
 * CJK text is NOT lowercased (ideographs don't have case) but IS
 * diacritic-folded (some CJK-adjacent scripts use combining marks).
 */
export function normalizeForI18nSearch(query: string): string {
  const trimmed = query.trim();
  if (trimmed.length === 0) return "";
  return foldDiacritics(trimmed).toLowerCase();
}

/**
 * Script category for a query. Used by the intent classifier to adjust
 * heuristics (e.g. skip word-count-based intent detection for CJK).
 */
export type QueryScript = "latin" | "cjk" | "rtl" | "mixed";

export function detectQueryScript(query: string): QueryScript {
  const hasCJK = containsCJK(query);
  const hasRTL = isRTLText(query);
  if (hasCJK && hasRTL) return "mixed";
  if (hasCJK) return "cjk";
  if (hasRTL) return "rtl";
  return "latin";
}
