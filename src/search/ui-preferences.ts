const STORAGE_KEY = "ryu.search.ui.preferences.v1";
const CHANGE_EVENT = "ryu:search-ui-preferences-changed";

export type SearchUiPreferences = {
  manualFacetControls: boolean;
};

const DEFAULT_PREFERENCES: SearchUiPreferences = {
  manualFacetControls: false
};

export function getSearchUiPreferences(): SearchUiPreferences {
  if (typeof localStorage === "undefined") return DEFAULT_PREFERENCES;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;

    const parsed = JSON.parse(raw) as Partial<SearchUiPreferences>;
    return {
      manualFacetControls: Boolean(parsed.manualFacetControls)
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function setSearchUiPreferences(patch: Partial<SearchUiPreferences>): SearchUiPreferences {
  const current = getSearchUiPreferences();
  const next: SearchUiPreferences = {
    ...current,
    ...patch,
    manualFacetControls: Boolean((patch.manualFacetControls ?? current.manualFacetControls))
  };

  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<SearchUiPreferences>(CHANGE_EVENT, { detail: next }));
  }

  return next;
}

export function subscribeSearchUiPreferences(
  listener: (preferences: SearchUiPreferences) => void
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleChange = (event: Event) => {
    const custom = event as CustomEvent<SearchUiPreferences>;
    if (custom.detail) {
      listener(custom.detail);
      return;
    }

    listener(getSearchUiPreferences());
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    listener(getSearchUiPreferences());
  };

  window.addEventListener(CHANGE_EVENT, handleChange as EventListener);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, handleChange as EventListener);
    window.removeEventListener("storage", handleStorage);
  };
}
