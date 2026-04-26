import type { DeviceCapabilityTier } from './device-capabilities';
import type { EmbeddingRuntime, RerankerRuntime } from './runtime-settings';

export type ActiveEmbeddingProviderId =
  | 'embeddinggemma'
  | 'minilm'
  | 'deterministic'
  | 'deterministic-fallback';

export type SearchRuntimeStatus = {
  configuredEmbeddingRuntime: EmbeddingRuntime;
  configuredRerankerRuntime: RerankerRuntime;
  activeEmbeddingProvider: ActiveEmbeddingProviderId;
  activeRerankerProvider: RerankerRuntime;
  deviceTier: DeviceCapabilityTier;
  lastAppliedAt: string;
  lastFallbackReason?: string;
  lastError?: string;
};

const DEFAULT_STATUS: SearchRuntimeStatus = {
  configuredEmbeddingRuntime: 'auto',
  configuredRerankerRuntime: 'off',
  activeEmbeddingProvider: 'deterministic',
  activeRerankerProvider: 'off',
  deviceTier: 'standard',
  lastAppliedAt: new Date(0).toISOString()
};

let status = DEFAULT_STATUS;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function hasStatusChanges(patch: Partial<SearchRuntimeStatus>): boolean {
  return Object.keys(patch).some((key) => {
    if (key === 'lastAppliedAt') return false;
    const statusKey = key as keyof SearchRuntimeStatus;
    return status[statusKey] !== patch[statusKey];
  });
}

export function getSearchRuntimeStatus(): SearchRuntimeStatus {
  return status;
}

export function subscribeSearchRuntimeStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateSearchRuntimeStatus(patch: Partial<SearchRuntimeStatus>): SearchRuntimeStatus {
  if (!hasStatusChanges(patch)) return status;

  status = {
    ...status,
    ...patch
  };

  emit();
  return status;
}

export function resetSearchRuntimeStatus(): void {
  status = DEFAULT_STATUS;
  emit();
}
