const PREFIX = "ryu:moderation-filter-map:v1:";
const MAX_ENTRIES = 1_000;

function key(owner: string): string | null {
  const normalized = owner.trim();
  return normalized && normalized.length <= 1_024 ? `${PREFIX}${encodeURIComponent(normalized)}` : null;
}

function load(owner: string): Record<string, string> {
  const storageKey = key(owner);
  if (!storageKey || typeof localStorage === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const entries = Object.entries(parsed as Record<string, unknown>)
      .filter(([localId, remoteId]) => localId.length > 0 && localId.length <= 2_048 && typeof remoteId === "string" && remoteId.length > 0 && remoteId.length <= 2_048)
      .slice(0, MAX_ENTRIES);
    return Object.fromEntries(entries) as Record<string, string>;
  } catch {
    return {};
  }
}

function save(owner: string, mapping: Record<string, string>): void {
  const storageKey = key(owner);
  if (!storageKey || typeof localStorage === "undefined") return;
  try { localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(Object.entries(mapping).slice(-MAX_ENTRIES)))); } catch { /* best effort */ }
}

export function getRemoteFilterId(owner: string, localFilterId: string): string | undefined {
  return load(owner)[localFilterId.trim()];
}

export function setRemoteFilterId(owner: string, localFilterId: string, remoteFilterId: string): void {
  const localId = localFilterId.trim();
  const remoteId = remoteFilterId.trim();
  if (!localId || !remoteId) return;
  const mapping = load(owner);
  mapping[localId] = remoteId;
  save(owner, mapping);
}

export function removeRemoteFilterId(owner: string, localFilterId: string): void {
  const mapping = load(owner);
  delete mapping[localFilterId.trim()];
  save(owner, mapping);
}
