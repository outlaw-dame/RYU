/**
 * Phase 23 — Date and number formatting utilities extracted from App.tsx.
 *
 * Uses Intl formatters for locale-aware output. Formatters are cached
 * per-locale so language switches are handled correctly without creating
 * new Intl objects on every render.
 */

const activityFormatters = new Map<string, Intl.DateTimeFormat>();
const fullDateFormatters = new Map<string, Intl.DateTimeFormat>();

function getActivityFormatter(locale?: string): Intl.DateTimeFormat {
  const key = locale || "default";
  let formatter = activityFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
    activityFormatters.set(key, formatter);
  }
  return formatter;
}

function getFullDateFormatter(locale?: string): Intl.DateTimeFormat {
  const key = locale || "default";
  let formatter = fullDateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
    fullDateFormatters.set(key, formatter);
  }
  return formatter;
}

const numberFormatter = new Intl.NumberFormat();

/**
 * Format a date string into a short activity-style label (e.g., "Jun 17, 3:42 PM").
 */
export function formatActivityDate(value: string, locale?: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return getActivityFormatter(locale).format(date);
}

/**
 * Format a date string into a full date label (e.g., "Jun 17, 2026").
 */
export function formatFullDate(value: string, locale?: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return getFullDateFormatter(locale).format(date);
}

/**
 * Format a number with locale-aware grouping separators.
 */
export function formatCount(value: number): string {
  return numberFormatter.format(value);
}
