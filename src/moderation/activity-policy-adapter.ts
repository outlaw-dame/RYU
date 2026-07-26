import type { MastodonNotification, MastodonStatus } from "../sync/mastodon-client";
import type { ModeratableStatus, PolicySurfaceResult } from "./policy-surface-adapter";

export type ModeratableNotification = ModeratableStatus & {
  notification: MastodonNotification;
};

/**
 * Preserve the original notification while exposing only the status-like fields
 * consumed by policy evaluation. The actor is always the notification account;
 * status content is supplemental and never supplies viewer authority.
 */
export function notificationToModeratableStatus(
  notification: MastodonNotification
): ModeratableNotification {
  const status = notification.status ?? undefined;
  return {
    notification,
    account: notification.account,
    content: status?.content,
    sensitive: status?.sensitive,
    spoiler_text: status?.spoiler_text,
    reblog: status?.reblog
  };
}

export function visibleStatuses(
  results: readonly PolicySurfaceResult<MastodonStatus>[]
): PolicySurfaceResult<MastodonStatus>[] {
  return results.filter((result) => !result.hidden);
}

export function visibleNotifications(
  results: readonly PolicySurfaceResult<ModeratableNotification>[]
): Array<PolicySurfaceResult<ModeratableNotification> & { notification: MastodonNotification }> {
  return results
    .filter((result) => !result.hidden)
    .map((result) => ({ ...result, notification: result.item.notification }));
}
