import type { SearchEntityType } from './types';

const STORAGE_KEY = 'ryu.search.preferences.v1';

export type SearchPreferences = {
  preferredTypes?: Partial<Record<SearchEntityType, number>>;
};

const DEFAULT_PREFERENCES: SearchPreferences = {
  preferredTypes: {}
};

function clampWeight(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(-5, Math.min(5, value));
}

export function getSearchPreferences(): SearchPreferences {
  if (typeof localStorage === 'undefined') return DEFAULT_PREFERENCES;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;

    const parsed = JSON.parse(raw) as SearchPreferences;
    const preferredTypes: SearchPreferences['preferredTypes'] = {};

    for (const type of ['edition', 'work', 'author'] as const) {
      const value = clampWeight(parsed.preferredTypes?.[type]);
      if (typeof value === 'number') preferredTypes[type] = value;
    }

    return { preferredTypes };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function setSearchPreferences(preferences: SearchPreferences): void {
  if (typeof localStorage === 'undefined') return;

  const preferredTypes: SearchPreferences['preferredTypes'] = {};

  for (const type of ['edition', 'work', 'author'] as const) {
    const value = clampWeight(preferences.preferredTypes?.[type]);
    if (typeof value === 'number') preferredTypes[type] = value;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify({ preferredTypes }));
}

export function resetSearchPreferences(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
