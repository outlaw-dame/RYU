/**
 * Phase 35 - Content filter.
 *
 * Local keyword/phrase filters with configurable actions (hide, warn, blur).
 * Persisted to localStorage. Supports whole-word matching and expiry.
 */

import type { ContentFilter, ContentFilterAction } from "./types";
import { buildKeywordRegex } from "./keyword-utils";

const STORAGE_KEY = "ryu:content-filters";

let idCounter = 0;

/**
 * Generate a unique filter ID.
 */
function generateFilterId(): string {
  idCounter += 1;
  return `filter-${Date.now()}-${idCounter}`;
}

/**
 * Load content filters from localStorage.
 */
export function loadContentFilters(): ContentFilter[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: ContentFilter[] = JSON.parse(raw);
    // Filter out expired filters
    return parsed.filter((f) => !isFilterExpired(f));
  } catch {
    return [];
  }
}

/**
 * Save content filters to localStorage.
 */
export function saveContentFilters(filters: ContentFilter[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Storage full or unavailable; silently fail
  }
}

/**
 * Check if a filter has expired.
 */
export function isFilterExpired(filter: ContentFilter): boolean {
  if (!filter.expiresAt) return false;
  return Date.now() > Date.parse(filter.expiresAt);
}

/**
 * Add a new content filter.
 */
export function addContentFilter(
  phrase: string,
  options: {
    wholeWord?: boolean;
    action?: ContentFilterAction;
    durationMs?: number;
  } = {}
): ContentFilter[] {
  const filters = loadContentFilters();

  const filter: ContentFilter = {
    id: generateFilterId(),
    phrase: phrase.trim(),
    wholeWord: options.wholeWord ?? false,
    action: options.action ?? "hide",
    createdAt: new Date().toISOString(),
    expiresAt: options.durationMs
      ? new Date(Date.now() + options.durationMs).toISOString()
      : null
  };

  filters.push(filter);
  saveContentFilters(filters);
  return filters;
}

/**
 * Remove a content filter by ID.
 */
export function removeContentFilter(filterId: string): ContentFilter[] {
  const filters = loadContentFilters().filter((f) => f.id !== filterId);
  saveContentFilters(filters);
  return filters;
}

/**
 * Update an existing content filter.
 */
export function updateContentFilter(
  filterId: string,
  updates: Partial<Pick<ContentFilter, "phrase" | "wholeWord" | "action" | "expiresAt">>
): ContentFilter[] {
  const filters = loadContentFilters();
  const index = filters.findIndex((f) => f.id === filterId);
  if (index >= 0) {
    filters[index] = { ...filters[index], ...updates };
  }
  saveContentFilters(filters);
  return filters;
}

/**
 * Build a regex pattern for a content filter phrase.
 * Uses shared keyword-utils for CJK-aware boundary logic.
 */
function buildFilterPattern(filter: ContentFilter): RegExp {
  return buildKeywordRegex(filter.phrase, filter.wholeWord);
}

/**
 * Check if a text matches a content filter.
 */
export function matchesFilter(text: string, filter: ContentFilter): boolean {
  if (isFilterExpired(filter)) return false;
  const pattern = buildFilterPattern(filter);
  return pattern.test(text);
}

/**
 * Check text against all active filters.
 * Returns the first matching filter with the highest severity, or undefined.
 *
 * Severity order: hide > warn > blur
 */
export function checkContentFilters(text: string): ContentFilter | undefined {
  const filters = loadContentFilters();
  const actionPriority: Record<ContentFilterAction, number> = {
    hide: 3,
    warn: 2,
    blur: 1
  };

  let bestMatch: ContentFilter | undefined;
  let bestPriority = 0;

  for (const filter of filters) {
    if (matchesFilter(text, filter)) {
      const priority = actionPriority[filter.action];
      if (priority > bestPriority) {
        bestMatch = filter;
        bestPriority = priority;
      }
    }
  }

  return bestMatch;
}

/**
 * Purge expired content filters and persist.
 */
export function purgeExpiredFilters(): ContentFilter[] {
  const filters = loadContentFilters(); // Already filters expired
  saveContentFilters(filters);
  return filters;
}
