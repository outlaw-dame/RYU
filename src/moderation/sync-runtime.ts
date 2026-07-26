import type { ModerationProxyAction } from "./moderation-proxy-api";
import { enqueueModerationAction } from "./sync-queue";
import { mergeRemoteModerationState } from "./remote-merge";
import { pushOrQueueModerationAction, syncModerationState } from "./sync-service";

export function scheduleModerationAction(ownerAccountId: string | null, action: ModerationProxyAction): void {
  if (!ownerAccountId) return;
  void pushOrQueueModerationAction(ownerAccountId, action, enqueueModerationAction).catch(() => {
    // Non-retryable authorization/validation failures must not undo local policy.
    // They are intentionally not logged with target identifiers.
  });
}

export function runModerationSync(ownerAccountId: string, onUpdated: () => void): Promise<void> {
  return syncModerationState(ownerAccountId, {
    applyRemoteState: (state) => {
      mergeRemoteModerationState(state);
      onUpdated();
    }
  }).then(() => undefined);
}
