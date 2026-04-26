export type EmbeddingRuntime = 'auto' | 'deterministic' | 'minilm' | 'embeddinggemma';
export type RerankerRuntime = 'off' | 'qwen3' | 'jina';

export type SearchRuntimeSettings = {
  /**
   * "auto" is the product default: use EmbeddingGemma on capable devices,
   * fall back to MiniLM where appropriate, then deterministic embeddings.
   */
  embeddingRuntime: EmbeddingRuntime;
  rerankerRuntime: RerankerRuntime;
  webLLMIntentRefinement: boolean;
  jinaRerankerUrl?: string;
};

const STORAGE_KEY = 'ryu.search.runtime-settings.v1';

export const DEFAULT_SEARCH_RUNTIME_SETTINGS: SearchRuntimeSettings = {
  embeddingRuntime: 'auto',
  rerankerRuntime: 'off',
  webLLMIntentRefinement: false
};

function isEmbeddingRuntime(value: unknown): value is EmbeddingRuntime {
  return value === 'auto' || value === 'deterministic' || value === 'minilm' || value === 'embeddinggemma';
}

function isRerankerRuntime(value: unknown): value is RerankerRuntime {
  return value === 'off' || value === 'qwen3' || value === 'jina';
}

function sanitizeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  try {
    const url = new URL(trimmed, globalThis.location?.origin ?? 'http://localhost');
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function getSearchRuntimeSettings(): SearchRuntimeSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_SEARCH_RUNTIME_SETTINGS;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SEARCH_RUNTIME_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<SearchRuntimeSettings>;

    return {
      embeddingRuntime: isEmbeddingRuntime(parsed.embeddingRuntime)
        ? parsed.embeddingRuntime
        : DEFAULT_SEARCH_RUNTIME_SETTINGS.embeddingRuntime,
      rerankerRuntime: isRerankerRuntime(parsed.rerankerRuntime)
        ? parsed.rerankerRuntime
        : DEFAULT_SEARCH_RUNTIME_SETTINGS.rerankerRuntime,
      webLLMIntentRefinement: typeof parsed.webLLMIntentRefinement === 'boolean'
        ? parsed.webLLMIntentRefinement
        : DEFAULT_SEARCH_RUNTIME_SETTINGS.webLLMIntentRefinement,
      jinaRerankerUrl: sanitizeUrl(parsed.jinaRerankerUrl)
    };
  } catch {
    return DEFAULT_SEARCH_RUNTIME_SETTINGS;
  }
}

export function setSearchRuntimeSettings(settings: Partial<SearchRuntimeSettings>): SearchRuntimeSettings {
  const current = getSearchRuntimeSettings();
  const next: SearchRuntimeSettings = {
    embeddingRuntime: isEmbeddingRuntime(settings.embeddingRuntime) ? settings.embeddingRuntime : current.embeddingRuntime,
    rerankerRuntime: isRerankerRuntime(settings.rerankerRuntime) ? settings.rerankerRuntime : current.rerankerRuntime,
    webLLMIntentRefinement: typeof settings.webLLMIntentRefinement === 'boolean'
      ? settings.webLLMIntentRefinement
      : current.webLLMIntentRefinement,
    jinaRerankerUrl: sanitizeUrl(settings.jinaRerankerUrl) ?? current.jinaRerankerUrl
  };

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Runtime settings are non-critical; storage quota must not break search.
    }
  }

  return next;
}

export function resetSearchRuntimeSettings(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
