/**
 * Phase 21 — Accessible search result explanations.
 *
 * Transforms internal search explanation objects into human-readable,
 * screen-reader-friendly text. The output is designed to be placed in
 * `aria-label` or `aria-description` attributes and announced by
 * assistive technology without being overly technical.
 *
 * Rules:
 * - Never expose raw scores, alpha values, or internal identifiers
 * - Use plain language: "Found by title match" not "lexical_score=0.92"
 * - Keep announcements short (< 120 chars) for screen readers
 * - Include the ranking reason so users understand WHY a result appeared
 */

export type ExplanationReason =
  | "title"
  | "author"
  | "isbn"
  | "description"
  | "semantic"
  | "feedback-boost"
  | "exploration"
  | "rerank"
  | "context-boost"
  | string;

export type AccessibleExplanation = {
  /** Short text for aria-label (< 120 chars). */
  summary: string;
  /** Whether semantic/AI search contributed to this result. */
  usedSemantic: boolean;
  /** Primary match reason in plain language. */
  primaryReason: string;
};

const REASON_LABELS: Record<string, string> = {
  title: "title match",
  author: "author match",
  isbn: "ISBN match",
  description: "description match",
  semantic: "meaning-based match",
  "feedback-boost": "previously selected",
  exploration: "discovery suggestion",
  rerank: "relevance reordering",
  "context-boost": "library context"
};

function reasonToLabel(reason: string): string {
  return REASON_LABELS[reason] ?? "search match";
}

/**
 * Build an accessible explanation from the internal reasons array and
 * whether semantic search was used for this result.
 */
export function buildAccessibleExplanation(
  reasons: string[] | undefined,
  usedSemantic: boolean,
  resultType: string
): AccessibleExplanation {
  const typeLabel = resultType === "edition" ? "Book" :
    resultType === "work" ? "Work" :
    resultType === "author" ? "Author" :
    resultType === "review" ? "Review" :
    "Result";

  if (!reasons || reasons.length === 0) {
    return {
      summary: `${typeLabel}. Found by search.`,
      usedSemantic,
      primaryReason: "search match"
    };
  }

  const primaryReason = reasonToLabel(reasons[0]);
  const semanticNote = usedSemantic ? " Enhanced by AI." : "";
  const summary = `${typeLabel}. Found by ${primaryReason}.${semanticNote}`;

  return {
    summary: summary.slice(0, 120),
    usedSemantic,
    primaryReason
  };
}

/**
 * Build an accessible status announcement for search state changes.
 * Used with aria-live regions so screen readers announce progress.
 */
export function buildSearchStatusAnnouncement(
  state: "idle" | "searching" | "results" | "no-results" | "error",
  resultCount?: number
): string {
  switch (state) {
    case "idle":
      return "";
    case "searching":
      return "Searching…";
    case "results":
      if (typeof resultCount === "number") {
        return resultCount === 1
          ? "1 result found."
          : `${resultCount} results found.`;
      }
      return "Results found.";
    case "no-results":
      return "No results found.";
    case "error":
      return "Search encountered an error. Please try again.";
  }
}
