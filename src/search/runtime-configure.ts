import { registerEmbeddingProvider, resetEmbeddingProvider } from './embedding-provider';
import { createMiniLMEmbeddingProvider } from './minilm-provider';
import { clearRerankerProvider, createJinaReranker, createQwen3Reranker, registerRerankerProvider } from './reranker-provider';
import { getSearchRuntimeSettings, type SearchRuntimeSettings } from './runtime-settings';

export function applySearchRuntimeSettings(settings: SearchRuntimeSettings = getSearchRuntimeSettings()): void {
  if (settings.embeddingRuntime === 'minilm') {
    registerEmbeddingProvider(createMiniLMEmbeddingProvider());
  } else {
    resetEmbeddingProvider();
  }

  if (settings.rerankerRuntime === 'qwen3') {
    registerRerankerProvider(createQwen3Reranker());
    return;
  }

  if (settings.rerankerRuntime === 'jina' && settings.jinaRerankerUrl) {
    registerRerankerProvider(createJinaReranker(settings.jinaRerankerUrl));
    return;
  }

  clearRerankerProvider();
}
