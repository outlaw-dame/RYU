import { loadMuteList, saveMuteList } from "./mute-store";
import { loadBlockList, saveBlockList } from "./block-store";
import { loadDomainBlockList, normalizeDomain, saveDomainBlockList } from "./domain-block-store";
import { loadContentFilters, saveContentFilters } from "./content-filter";
import type { ContentFilter, ContentFilterAction } from "./types";
import type { RemoteModerationState } from "./moderation-proxy-api";

/**
 * Union-merges server state into local policy. Local removals waiting in the
 * offline queue are applied after this pull by queue drain ordering; therefore
 * importing remote records here never deletes a local safety decision.
 */
export function mergeRemoteModerationState(state: RemoteModerationState): void {
  const now = new Date().toISOString();

  const mutes = new Map(loadMuteList().map((entry) => [entry.accountId, entry]));
  for (const remote of state.mutes) {
    if (!remote?.id || mutes.has(remote.id)) continue;
    mutes.set(remote.id, { accountId: remote.id, acct: remote.acct, createdAt: now, expiresAt: null, hideNotifications: true });
  }
  saveMuteList([...mutes.values()]);

  const blocks = new Map(loadBlockList().map((entry) => [entry.accountId, entry]));
  for (const remote of state.blocks) {
    if (!remote?.id || blocks.has(remote.id)) continue;
    blocks.set(remote.id, { accountId: remote.id, acct: remote.acct, createdAt: now });
  }
  saveBlockList([...blocks.values()]);

  const domains = new Map(loadDomainBlockList().map((entry) => [entry.domain, entry]));
  for (const value of state.domains) {
    const domain = normalizeDomain(value);
    if (domain && !domains.has(domain)) domains.set(domain, { domain, createdAt: now });
  }
  saveDomainBlockList([...domains.values()]);

  const filters = new Map(loadContentFilters().map((entry) => [filterIdentity(entry), entry]));
  for (const remote of state.filters) {
    const keyword = remote.keywords?.[0]?.keyword?.trim();
    if (!remote.id || !keyword) continue;
    const action: ContentFilterAction = remote.filter_action === "hide" ? "hide" : "warn";
    const imported: ContentFilter = {
      id: `remote:${remote.id}`,
      phrase: keyword,
      wholeWord: remote.keywords?.[0]?.whole_word ?? false,
      action,
      createdAt: now,
      expiresAt: remote.expires_at ?? null
    };
    const identity = filterIdentity(imported);
    if (!filters.has(identity)) filters.set(identity, imported);
  }
  saveContentFilters([...filters.values()]);
}

function filterIdentity(filter: Pick<ContentFilter, "phrase" | "wholeWord" | "action">): string {
  return `${filter.phrase.trim().toLocaleLowerCase()}\u001f${filter.wholeWord ? "1" : "0"}\u001f${filter.action}`;
}
