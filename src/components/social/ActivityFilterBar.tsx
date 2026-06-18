/**
 * Phase 31 - ActivityFilterBar component.
 *
 * Filter controls for the book activity feed:
 * All, Books, Reviews, Recommendations, Following.
 */

import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityFilter } from "../../social/types";

export type ActivityFilterBarProps = {
  /** Current active filter. */
  activeFilter: ActivityFilter;
  /** Callback when filter changes. */
  onFilterChange: (filter: ActivityFilter) => void;
  /** Count of book-related items (shown as badge on Books filter). */
  bookCount?: number;
};

const FILTERS: ActivityFilter[] = ["all", "books", "reviews", "recommendations", "following"];

export function ActivityFilterBar({
  activeFilter,
  onFilterChange,
  bookCount
}: ActivityFilterBarProps) {
  const { t } = useTranslation();

  return (
    <nav
      role="tablist"
      aria-label={t("social.filterLabel", { defaultValue: "Activity filters" })}
      style={{
        display: "flex",
        gap: "var(--space-2)",
        padding: "0 var(--space-4)",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none"
      }}
    >
      {FILTERS.map((filter) => (
        <FilterChip
          key={filter}
          filter={filter}
          isActive={activeFilter === filter}
          onSelect={onFilterChange}
          badge={filter === "books" ? bookCount : undefined}
        />
      ))}
    </nav>
  );
}

type FilterChipProps = {
  filter: ActivityFilter;
  isActive: boolean;
  onSelect: (filter: ActivityFilter) => void;
  badge?: number;
};

function FilterChip({ filter, isActive, onSelect, badge }: FilterChipProps) {
  const { t } = useTranslation();

  const handleClick = useCallback(() => {
    onSelect(filter);
  }, [filter, onSelect]);

  const label = getFilterLabel(filter, t);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={handleClick}
      style={{
        border: isActive
          ? "1px solid var(--color-accent)"
          : "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)",
        borderRadius: "999px",
        background: isActive
          ? "color-mix(in srgb, var(--color-accent) 12%, var(--color-bg))"
          : "var(--color-bg-secondary)",
        color: isActive ? "var(--color-accent)" : "var(--color-text-secondary)",
        padding: "var(--space-2) var(--space-3)",
        fontSize: "var(--text-caption1)",
        fontWeight: isActive ? 600 : 400,
        whiteSpace: "nowrap",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "var(--space-1)",
        minHeight: 32,
        transition: "background 0.15s, border-color 0.15s, color 0.15s"
      }}
    >
      {label}
      {badge != null && badge > 0 ? (
        <span
          style={{
            fontSize: "var(--text-caption2, 10px)",
            background: isActive ? "var(--color-accent)" : "color-mix(in srgb, var(--color-text) 20%, transparent)",
            color: isActive ? "var(--color-bg)" : "var(--color-text)",
            borderRadius: "999px",
            padding: "1px 5px",
            minWidth: 16,
            textAlign: "center",
            fontWeight: 600
          }}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function getFilterLabel(filter: ActivityFilter, t: (key: string, options?: Record<string, unknown>) => string): string {
  switch (filter) {
    case "all":
      return t("social.filterAll", { defaultValue: "All" });
    case "books":
      return t("social.filterBooks", { defaultValue: "Books" });
    case "reviews":
      return t("social.filterReviews", { defaultValue: "Reviews" });
    case "recommendations":
      return t("social.filterRecommendations", { defaultValue: "Recommendations" });
    case "following":
      return t("social.filterFollowing", { defaultValue: "Following" });
    default:
      return filter;
  }
}
