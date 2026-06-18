/**
 * Notification grouper - combines multiple notifications of the same type
 * targeting the same status into a single grouped item.
 *
 * Grouping rules:
 * - favourite + same status ID -> single group
 * - reblog + same status ID -> single group
 * - follow (no status) -> all consecutive follows grouped
 * - mention, status, update, poll -> not grouped (shown individually)
 */

import type {
  GroupedNotification,
  NotificationType,
  RawNotification
} from "./types";

/** Types that can be grouped by target status. */
const GROUPABLE_BY_STATUS = new Set<string>(["favourite", "reblog"]);

/** Types that can be grouped without a target status. */
const GROUPABLE_WITHOUT_STATUS = new Set<string>(["follow"]);

/**
 * Groups an array of raw notifications into presentational groups.
 *
 * The input should be sorted by created_at descending (most recent first).
 * The output preserves this ordering by latest notification timestamp.
 */
export function groupNotifications(notifications: RawNotification[]): GroupedNotification[] {
  const groups: GroupedNotification[] = [];
  const statusGroupMap = new Map<string, GroupedNotification>();
  let currentFollowGroup: GroupedNotification | null = null;

  for (const notification of notifications) {
    const type = notification.type as NotificationType;

    // Group favourites/reblogs by status ID
    if (GROUPABLE_BY_STATUS.has(type) && notification.status?.id) {
      const groupKey = `${type}:${notification.status.id}`;
      const existing = statusGroupMap.get(groupKey);

      if (existing) {
        // Add account to existing group if not already present
        const hasAccount = existing.accounts.some((a) => a.id === notification.account.id);
        if (!hasAccount) {
          existing.accounts.push(notification.account);
        }
        existing.notificationIds.push(notification.id);
        // Update latestAt if this notification is newer
        if (notification.created_at > existing.latestAt) {
          existing.latestAt = notification.created_at;
        }
      } else {
        const group: GroupedNotification = {
          key: notification.id,
          type,
          accounts: [notification.account],
          status: notification.status,
          latestAt: notification.created_at,
          notificationIds: [notification.id]
        };
        statusGroupMap.set(groupKey, group);
        groups.push(group);
      }
      // Close any open follow group
      currentFollowGroup = null;
      continue;
    }

    // Group consecutive follows together
    if (GROUPABLE_WITHOUT_STATUS.has(type)) {
      if (currentFollowGroup) {
        const hasAccount = currentFollowGroup.accounts.some((a) => a.id === notification.account.id);
        if (!hasAccount) {
          currentFollowGroup.accounts.push(notification.account);
        }
        currentFollowGroup.notificationIds.push(notification.id);
        if (notification.created_at > currentFollowGroup.latestAt) {
          currentFollowGroup.latestAt = notification.created_at;
        }
      } else {
        currentFollowGroup = {
          key: notification.id,
          type,
          accounts: [notification.account],
          status: null,
          latestAt: notification.created_at,
          notificationIds: [notification.id]
        };
        groups.push(currentFollowGroup);
      }
      continue;
    }

    // Non-groupable types: each notification is its own group
    currentFollowGroup = null;
    groups.push({
      key: notification.id,
      type,
      accounts: [notification.account],
      status: notification.status,
      latestAt: notification.created_at,
      notificationIds: [notification.id]
    });
  }

  // Sort groups by latestAt descending
  groups.sort((a, b) => (a.latestAt > b.latestAt ? -1 : a.latestAt < b.latestAt ? 1 : 0));

  return groups;
}
