import { registerEmbeddingProvider, resetEmbeddingProvider } from './embedding-provider';
import { createEmbeddingGemmaProvider } from './embeddinggemma-provider';
import { createMiniLMEmbeddingProvider } from './minilm-provider';
import { clearRerankerProvider, createJinaReranker, createQwen3Reranker, registerRerankerProvider } from './reranker-provider';
import { canAttemptEmbeddingGemma, canAttemptMiniLM } from './device-capabilities';
import { getSearchRuntimeSettings, type SearchRuntimeSettings } from './runtime-settings';

export function applySearchRuntimeSettings(settings: SearchRuntimeSettings = getSearchRuntimeSettings()): void {
  if (settings.embeddingRuntime === 'embeddinggemma') {
    registerEmbeddingProvider(createEmbeddingGemmaProvider());
  } else if (settings.embeddingRuntime === 'minilm') {
    registerEmbeddingProvider(createMiniLMEmbeddingProvider());
  } else if (settings.embeddingRuntime === 'auto') {
    if (canAttemptEmbeddingGemma()) {
      registerEmbeddingProvider(createEmbeddingGemmaProvider());
    } else if (canAttemptMiniLM()) {
      registerEmbeddingProvider(createMiniLMEmbeddingProvider());
    } else {
      resetEmbeddingProvider();
    }
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
