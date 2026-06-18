/**
 * NotificationList - Grouped notification list with read/unread styling.
 *
 * Renders the filter bar, mark-all-read action, and grouped notification items.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { useNotifications } from "../../hooks/useNotifications";
import { NotificationFilterBar } from "./NotificationFilterBar";
import { NotificationGroup } from "./NotificationGroup";

export type NotificationListProps = {
  enabled?: boolean;
};

export function NotificationList({ enabled = true }: NotificationListProps) {
  const { t } = useTranslation();
  const {
    groups,
    unreadCount,
    isLoading,
    filter,
    setFilter,
    markGroupRead,
    markAllRead,
    isRead
  } = useNotifications({ enabled });

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      {/* Filter bar */}
      <NotificationFilterBar activeFilter={filter} onFilterChange={setFilter} />

      {/* Mark all read action */}
      {unreadCount > 0 && (
        <div style={{ padding: "0 var(--space-4)", display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={markAllRead}
            style={{
              border: "none",
              background: "none",
              color: "var(--color-accent)",
              fontSize: "var(--text-caption1)",
              fontWeight: 600,
              cursor: "pointer",
              padding: "var(--space-1) var(--space-2)"
            }}
          >
            {t("notifications.markAllRead")}
          </button>
        </div>
      )}

      {/* Notification items */}
      <div
        role="list"
        aria-label={t("notifications.listLabel")}
        style={{ display: "grid", gap: "var(--space-3)", padding: "0 var(--space-4)" }}
      >
        {groups.length > 0 ? (
          groups.map((group) => (
            <div role="listitem" key={group.key} style={{ position: "relative" }}>
              <NotificationGroup
                group={group}
                isRead={isRead(group)}
                onMarkRead={markGroupRead}
              />
            </div>
          ))
        ) : isLoading ? (
          <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
            {t("notifications.loading")}
          </p>
        ) : (
          <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
            {t("notifications.empty")}
          </p>
        )}
      </div>
    </div>
  );
}
