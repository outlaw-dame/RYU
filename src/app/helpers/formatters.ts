/**
 * Phase 23 — Date and number formatting utilities extracted from App.tsx.
 *
 * Uses Intl formatters for locale-aware output. All formatters are
 * created once (module-level singletons) to avoid unnecessary GC pressure.
 */

const activityDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric"
});

const numberFormatter = new Intl.NumberFormat();

/**
 * Format a date string into a short activity-style label (e.g., "Jun 17, 3:42 PM").
 */
export function formatActivityDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return activityDateFormatter.format(date);
}

/**
 * Format a date string into a full date label (e.g., "Jun 17, 2026").
 */
export function formatFullDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return fullDateFormatter.format(date);
}

/**
 * Format a number with locale-aware grouping separators.
 */
export function formatCount(value: number): string {
  return numberFormatter.format(value);
}
