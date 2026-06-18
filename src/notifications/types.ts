/**
 * Notification domain types for RYU.
 *
 * Notifications are ephemeral UI state - not searchable, not indexed.
 * They are cached locally for offline access but are separate from
 * the search engine and library data.
 */

export type NotificationType =
  | "follow"
  | "favourite"
  | "mention"
  | "reblog"
  | "status"
  | "update"
  | "poll";

export const NOTIFICATION_TYPES: NotificationType[] = [
  "follow",
  "favourite",
  "mention",
  "reblog",
  "status",
  "update",
  "poll"
];

export type NotificationAccount = {
  id: string;
  acct?: string;
  display_name?: string;
  avatar?: string;
  url?: string;
};

export type NotificationStatus = {
  id: string;
  content?: string;
  url?: string | null;
  created_at: string;
};

export type RawNotification = {
  id: string;
  type: string;
  created_at: string;
  account: NotificationAccount;
  status?: NotificationStatus | null;
};

/**
 * A grouped notification combines multiple notifications of the same type
 * targeting the same status into a single presentational item.
 *
 * For example: "Alice, Bob, and 3 others favourited your post"
 */
export type GroupedNotification = {
  /** Unique key for React rendering (first notification ID in the group). */
  key: string;
  /** The notification type shared by all items in this group. */
  type: NotificationType;
  /** All accounts that triggered this notification group. */
  accounts: NotificationAccount[];
  /** The target status (if any). */
  status?: NotificationStatus | null;
  /** Timestamp of the most recent notification in the group. */
  latestAt: string;
  /** All notification IDs in this group (for read-state tracking). */
  notificationIds: string[];
};

export type NotificationFilter = "all" | NotificationType;

export const NOTIFICATION_FILTERS: NotificationFilter[] = [
  "all",
  "mention",
  "favourite",
  "follow",
  "reblog"
];

export type ReadState = {
  /** Set of notification IDs that have been read. */
  readIds: Set<string>;
  /** Timestamp of last "mark all read" action (any notification before this is read). */
  markAllReadAt: string | null;
};
