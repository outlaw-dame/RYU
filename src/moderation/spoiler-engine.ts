/**
 * BookWyrm spoiler engine.
 *
 * BookWyrm uses content_warning / spoiler_text (ActivityPub summary field) for
 * book spoilers. This engine detects book-specific spoiler CWs like "Contains
 * spoilers for The Name of the Wind" and cross-references with the user's
 * reading status to decide whether to enforce spoiler collapse.
 *
 * If the user has finished reading the book ("read" status), the spoiler is
 * shown normally. Otherwise, it is collapsed with a warning.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReadingStatus = "want-to-read" | "reading" | "read" | "did-not-finish";

export type SpoilerDetectionResult = {
  /** Whether a book-specific spoiler was detected. */
  isBookSpoiler: boolean;
  /** Whether it is a generic CW (not book-specific). */
  isGenericCW: boolean;
  /** The detected book title (if book-specific spoiler). */
  bookTitle: string | null;
  /** Whether the spoiler should be enforced (collapsed). */
  shouldEnforce: boolean;
  /** Reason for the enforcement decision. */
  reason: string;
};

export type SpoilerPreferences = {
  /** Auto-hide spoilers for unread books. Default: true. */
  autoHideUnread: boolean;
  /** Auto-hide all CWs regardless of type. Default: false. */
  autoHideAllCW: boolean;
  /** Show spoilers for books already read. Default: true. */
  showForReadBooks: boolean;
  /** Show spoilers for books marked did-not-finish. Default: false. */
  showForDNF: boolean;
};

export type ReadingStatusLookup = (bookTitle: string) => ReadingStatus | undefined;

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "ryu:spoiler-preferences";

/**
 * Patterns that indicate a book-specific spoiler CW.
 * Matched case-insensitively against spoiler_text.
 */
const BOOK_SPOILER_PATTERNS: RegExp[] = [
  /(?:contains?\s+)?spoilers?\s+(?:for|about|regarding)\s+(.+)/i,
  /(?:book|novel|series)\s+spoilers?[:\s]+(.+)/i,
  /spoiler(?:s)?\s*[-:]\s*(.+)/i,
  /(.+?)\s+spoilers?$/i,
  /cw[:\s]+(?:spoilers?\s+(?:for|about))?\s*(.+)/i
];

/**
 * Phrases that indicate a generic (non-book-specific) CW.
 */
const GENERIC_CW_INDICATORS: string[] = [
  "nsfw",
  "sensitive",
  "content warning",
  "trigger warning",
  "tw:",
  "cw:",
  "mh",
  "mental health",
  "violence",
  "death",
  "food",
  "politics",
  "uspol",
  "alcohol",
  "drugs",
  "nudity",
  "self-harm",
  "suicide"
];

// ─── Preferences ──────────────────────────────────────────────────────────────

const DEFAULT_PREFERENCES: SpoilerPreferences = {
  autoHideUnread: true,
  autoHideAllCW: false,
  showForReadBooks: true,
  showForDNF: false
};

/**
 * Load spoiler preferences from localStorage.
 */
export function loadSpoilerPreferences(): SpoilerPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw);
    return {
      autoHideUnread: parsed.autoHideUnread ?? DEFAULT_PREFERENCES.autoHideUnread,
      autoHideAllCW: parsed.autoHideAllCW ?? DEFAULT_PREFERENCES.autoHideAllCW,
      showForReadBooks: parsed.showForReadBooks ?? DEFAULT_PREFERENCES.showForReadBooks,
      showForDNF: parsed.showForDNF ?? DEFAULT_PREFERENCES.showForDNF
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/**
 * Save spoiler preferences to localStorage.
 */
export function saveSpoilerPreferences(prefs: SpoilerPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable
  }
}

// ─── Book Title Extraction ────────────────────────────────────────────────────

/**
 * Extract a book title from a spoiler text string.
 * Returns null if no book-specific spoiler pattern is detected.
 */
export function extractBookTitle(spoilerText: string): string | null {
  if (!spoilerText || !spoilerText.trim()) return null;

  const trimmed = spoilerText.trim();

  // Try book-specific patterns first (before generic CW check)
  for (const pattern of BOOK_SPOILER_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const title = match[1].trim()
        // Remove surrounding quotes
        .replace(/^["'\u201C\u201D\u2018\u2019]+|["'\u201C\u201D\u2018\u2019]+$/g, "")
        .trim();
      if (title.length > 0 && title.length < 200) {
        return title;
      }
    }
  }

  // Check if this is a generic CW (after patterns failed)
  const lower = trimmed.toLowerCase();
  for (const indicator of GENERIC_CW_INDICATORS) {
    if (lower === indicator || lower.startsWith(indicator + " ")) {
      return null;
    }
  }

  return null;
}

/**
 * Check if spoiler text looks like a generic content warning (not book-specific).
 */
export function isGenericContentWarning(spoilerText: string): boolean {
  if (!spoilerText || !spoilerText.trim()) return false;

  const lower = spoilerText.trim().toLowerCase();

  for (const indicator of GENERIC_CW_INDICATORS) {
    if (lower === indicator || lower.includes(indicator)) {
      return true;
    }
  }

  return false;
}

// ─── Spoiler Enforcement ──────────────────────────────────────────────────────

/**
 * Evaluate whether a spoiler should be enforced for the given content.
 *
 * Logic:
 * 1. If no spoiler_text, no enforcement needed.
 * 2. If generic CW (not book-specific), respect autoHideAllCW preference.
 * 3. If book-specific spoiler, check reading status:
 *    - "read" -> show if showForReadBooks
 *    - "did-not-finish" -> show if showForDNF
 *    - "reading" or "want-to-read" -> enforce (hide)
 *    - unknown -> enforce (cautious default)
 */
export function evaluateSpoiler(
  spoilerText: string | undefined | null,
  lookupReadingStatus: ReadingStatusLookup,
  preferences?: SpoilerPreferences
): SpoilerDetectionResult {
  const prefs = preferences ?? loadSpoilerPreferences();

  // No spoiler text = no enforcement
  if (!spoilerText || !spoilerText.trim()) {
    return {
      isBookSpoiler: false,
      isGenericCW: false,
      bookTitle: null,
      shouldEnforce: false,
      reason: "No content warning present"
    };
  }

  // Check if it is a generic CW
  if (isGenericContentWarning(spoilerText)) {
    const shouldEnforce = prefs.autoHideAllCW;
    return {
      isBookSpoiler: false,
      isGenericCW: true,
      bookTitle: null,
      shouldEnforce,
      reason: shouldEnforce
        ? "Generic content warning (auto-hide enabled)"
        : "Generic content warning (auto-hide disabled)"
    };
  }

  // Try to extract a book title
  const bookTitle = extractBookTitle(spoilerText);

  if (bookTitle) {
    // Book-specific spoiler detected
    if (!prefs.autoHideUnread) {
      return {
        isBookSpoiler: true,
        isGenericCW: false,
        bookTitle,
        shouldEnforce: false,
        reason: "Book spoiler auto-hide is disabled"
      };
    }

    const status = lookupReadingStatus(bookTitle);

    if (status === "read") {
      const shouldEnforce = !prefs.showForReadBooks;
      return {
        isBookSpoiler: true,
        isGenericCW: false,
        bookTitle,
        shouldEnforce,
        reason: shouldEnforce
          ? "Book marked as read but show-for-read is disabled"
          : "Book already read - showing spoiler"
      };
    }

    if (status === "did-not-finish") {
      const shouldEnforce = !prefs.showForDNF;
      return {
        isBookSpoiler: true,
        isGenericCW: false,
        bookTitle,
        shouldEnforce,
        reason: shouldEnforce
          ? "Book marked did-not-finish - hiding spoiler"
          : "Book marked did-not-finish - show-for-DNF enabled"
      };
    }

    if (status === "reading" || status === "want-to-read") {
      return {
        isBookSpoiler: true,
        isGenericCW: false,
        bookTitle,
        shouldEnforce: true,
        reason: `Book is in "${status}" status - hiding spoiler`
      };
    }

    // Unknown reading status - cautious default is to enforce
    return {
      isBookSpoiler: true,
      isGenericCW: false,
      bookTitle,
      shouldEnforce: true,
      reason: "Book reading status unknown - hiding spoiler by default"
    };
  }

  // Has spoiler text but not a recognized book pattern and not generic
  // Treat as a generic CW
  const shouldEnforce = prefs.autoHideAllCW;
  return {
    isBookSpoiler: false,
    isGenericCW: true,
    bookTitle: null,
    shouldEnforce,
    reason: shouldEnforce
      ? "Unrecognized content warning (auto-hide enabled)"
      : "Unrecognized content warning (auto-hide disabled)"
  };
}

// ─── Reading Status Lookup Helper ─────────────────────────────────────────────

const READING_STATUS_PREFIX = "ryu.reading-status.";

/**
 * Create a reading status lookup function that queries localStorage.
 *
 * This performs a fuzzy title match: it iterates all reading-status keys
 * and normalizes the stored edition IDs (which may be titles, ISBNs, or slugs)
 * for comparison.
 */
export function createLocalStorageReadingStatusLookup(): ReadingStatusLookup {
  return (bookTitle: string): ReadingStatus | undefined => {
    const normalizedTitle = bookTitle.trim().toLowerCase();
    if (!normalizedTitle) return undefined;

    try {
      // Direct lookup by title as edition ID
      const direct = localStorage.getItem(`${READING_STATUS_PREFIX}${normalizedTitle}`);
      if (isValidReadingStatus(direct)) return direct;

      // Scan all reading-status keys for title matches
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(READING_STATUS_PREFIX)) continue;

        const editionId = key.slice(READING_STATUS_PREFIX.length).toLowerCase();
        // Check if the edition ID contains or matches the book title
        if (editionId === normalizedTitle || editionId.includes(normalizedTitle)) {
          const value = localStorage.getItem(key);
          if (isValidReadingStatus(value)) return value;
        }
      }

      return undefined;
    } catch {
      return undefined;
    }
  };
}

function isValidReadingStatus(value: string | null): value is ReadingStatus {
  return value === "want-to-read" || value === "reading" || value === "read" || value === "did-not-finish";
}
