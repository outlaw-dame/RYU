/**
 * NotificationGroup - Renders a single grouped notification.
 *
 * Examples:
 * - "Alice, Bob favourited your post"
 * - "Carol followed you"
 * - "Dave mentioned you"
 */

import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { GroupedNotification } from "../../notifications/types";

export type NotificationGroupProps = {
  group: GroupedNotification;
  isRead: boolean;
  onMarkRead?: (notificationIds: string[]) => void;
};

export function NotificationGroup({ group, isRead, onMarkRead }: NotificationGroupProps) {
  const { t } = useTranslation();

  const accountNames = useMemo(() => {
    return group.accounts
      .slice(0, 3)
      .map((a) => a.display_name || a.acct || "Someone")
      .join(", ");
  }, [group.accounts]);

  const extraCount = group.accounts.length > 3 ? group.accounts.length - 3 : 0;

  const verb = useMemo(() => {
    switch (group.type) {
      case "follow":
        return t("activity.notificationVerbs.follow");
      case "favourite":
        return t("activity.notificationVerbs.favourite");
      case "mention":
        return t("activity.notificationVerbs.mention");
      case "reblog":
        return t("activity.notificationVerbs.reblog");
      case "status":
        return t("activity.notificationVerbs.status");
      case "update":
        return t("activity.notificationVerbs.update");
      default:
        return group.type.replace(/_/g, " ");
    }
  }, [group.type, t]);

  const statusPreview = useMemo(() => {
    if (!group.status?.content) return null;
    return group.status.content.replace(/<[^>]*>/g, "").trim();
  }, [group.status?.content]);

  const handleClick = () => {
    if (!isRead && onMarkRead) {
      onMarkRead(group.notificationIds);
    }
  };

  return (
    <article
      onClick={handleClick}
      style={{
        borderRadius: "var(--radius-md)",
        background: isRead
          ? "var(--color-bg-secondary)"
          : "var(--color-bg-elevated)",
        color: "var(--color-text)",
        padding: "var(--space-4)",
        display: "grid",
        gap: "var(--space-2)",
        border: isRead
          ? "1px solid color-mix(in srgb, var(--color-text) 6%, transparent)"
          : "1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)",
        opacity: isRead ? 0.8 : 1,
        cursor: isRead ? "default" : "pointer",
        transition: "opacity 0.15s ease"
      }}
    >
      {/* Avatars row */}
      {group.accounts.length > 0 && (
        <div style={{ display: "flex", gap: "var(--space-1)" }}>
          {group.accounts.slice(0, 5).map((account) => (
            <img
              key={account.id}
              src={account.avatar || undefined}
              alt=""
              aria-hidden="true"
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                objectFit: "cover",
                background: "var(--color-bg-secondary)"
              }}
            />
          ))}
        </div>
      )}

      {/* Main text */}
      <strong style={{ fontSize: "var(--text-subhead)", overflowWrap: "anywhere" }}>
        {accountNames}
        {extraCount > 0 ? ` ${t("notifications.andOthers", { count: extraCount })}` : ""}
        {" "}
        {verb}
      </strong>

      {/* Status preview */}
      {statusPreview ? (
        <p
          style={{
            margin: 0,
            color: "var(--color-text-secondary)",
            fontSize: "var(--text-footnote)",
            lineHeight: "var(--leading-footnote)",
            overflowWrap: "anywhere",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden"
          }}
        >
          {statusPreview}
        </p>
      ) : null}

      {/* Unread indicator */}
      {!isRead && (
        <div
          aria-label={t("notifications.unread")}
          style={{
            position: "absolute",
            top: "var(--space-2)",
            right: "var(--space-2)",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--color-accent)"
          }}
        />
      )}
    </article>
  );
}
