/**
 * NotificationFilterBar - Filter chips for notification types.
 *
 * Shows: All, Mentions, Favourites, Follows, Boosts
 */

import React from "react";
import { useTranslation } from "react-i18next";
import type { NotificationFilter } from "../../notifications/types";
import { NOTIFICATION_FILTERS } from "../../notifications/types";

export type NotificationFilterBarProps = {
  activeFilter: NotificationFilter;
  onFilterChange: (filter: NotificationFilter) => void;
};

const FILTER_I18N_KEYS: Record<NotificationFilter, string> = {
  all: "notifications.filterAll",
  mention: "notifications.filterMentions",
  favourite: "notifications.filterFavourites",
  follow: "notifications.filterFollows",
  reblog: "notifications.filterBoosts",
  status: "notifications.filterStatuses",
  update: "notifications.filterUpdates",
  poll: "notifications.filterPolls"
};

export function NotificationFilterBar({ activeFilter, onFilterChange }: NotificationFilterBarProps) {
  const { t } = useTranslation();

  return (
    <div
      role="tablist"
      aria-label={t("notifications.filtersLabel")}
      style={{
        display: "flex",
        gap: "var(--space-2)",
        padding: "0 var(--space-4)",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none"
      }}
    >
      {NOTIFICATION_FILTERS.map((filter) => (
        <button
          key={filter}
          type="button"
          role="tab"
          aria-selected={filter === activeFilter}
          onClick={() => onFilterChange(filter)}
          style={{
            border: "1px solid",
            borderColor: filter === activeFilter
              ? "var(--color-accent)"
              : "color-mix(in srgb, var(--color-text) 16%, transparent)",
            borderRadius: "999px",
            background: filter === activeFilter
              ? "color-mix(in srgb, var(--color-accent) 12%, var(--color-bg))"
              : "var(--color-bg-secondary)",
            color: filter === activeFilter
              ? "var(--color-accent)"
              : "var(--color-text-secondary)",
            fontSize: "var(--text-caption1)",
            fontWeight: filter === activeFilter ? 600 : 400,
            padding: "var(--space-1) var(--space-3)",
            minHeight: 32,
            whiteSpace: "nowrap",
            cursor: "pointer"
          }}
        >
          {t(FILTER_I18N_KEYS[filter])}
        </button>
      ))}
    </div>
  );
}
