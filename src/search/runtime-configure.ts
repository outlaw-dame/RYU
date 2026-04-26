import { registerEmbeddingProvider, resetEmbeddingProvider } from './embedding-provider';
import { createEmbeddingGemmaProvider } from './embeddinggemma-provider';
import { createMiniLMEmbeddingProvider } from './minilm-provider';
import { clearRerankerProvider, createJinaReranker, createQwen3Reranker, registerRerankerProvider } from './reranker-provider';
import { canAttemptEmbeddingGemma, canAttemptMiniLM, getDeviceCapabilityTier } from './device-capabilities';
import { updateSearchRuntimeStatus, type ActiveEmbeddingProviderId } from './runtime-status';
import { getSearchRuntimeSettings, type SearchRuntimeSettings } from './runtime-settings';

export function applySearchRuntimeSettings(settings: SearchRuntimeSettings = getSearchRuntimeSettings()): void {
  const deviceTier = getDeviceCapabilityTier();
  let activeEmbeddingProvider: ActiveEmbeddingProviderId = 'deterministic';
  let fallbackReason: string | undefined;

  if (settings.embeddingRuntime === 'embeddinggemma') {
    registerEmbeddingProvider(createEmbeddingGemmaProvider());
    activeEmbeddingProvider = 'embeddinggemma';
  } else if (settings.embeddingRuntime === 'minilm') {
    registerEmbeddingProvider(createMiniLMEmbeddingProvider());
    activeEmbeddingProvider = 'minilm';
  } else if (settings.embeddingRuntime === 'auto') {
    if (canAttemptEmbeddingGemma()) {
      registerEmbeddingProvider(createEmbeddingGemmaProvider());
      activeEmbeddingProvider = 'embeddinggemma';
    } else if (canAttemptMiniLM()) {
      registerEmbeddingProvider(createMiniLMEmbeddingProvider());
      activeEmbeddingProvider = 'minilm';
      fallbackReason = 'EmbeddingGemma skipped by device capability check.';
    } else {
      resetEmbeddingProvider();
      activeEmbeddingProvider = 'deterministic';
      fallbackReason = 'Enhanced embedding runtimes unavailable in this browser.';
    }
  } else {
    resetEmbeddingProvider();
    activeEmbeddingProvider = 'deterministic';
  }

  let activeRerankerProvider = settings.rerankerRuntime;

  if (settings.rerankerRuntime === 'qwen3') {
    registerRerankerProvider(createQwen3Reranker());
  } else if (settings.rerankerRuntime === 'jina' && settings.jinaRerankerUrl) {
    registerRerankerProvider(createJinaReranker(settings.jinaRerankerUrl));
  } else {
    clearRerankerProvider();
    activeRerankerProvider = 'off';
  }

  updateSearchRuntimeStatus({
    configuredEmbeddingRuntime: settings.embeddingRuntime,
    configuredRerankerRuntime: settings.rerankerRuntime,
    activeEmbeddingProvider,
    activeRerankerProvider,
    deviceTier,
    lastFallbackReason: fallbackReason,
    lastError: undefined,
    lastAppliedAt: new Date().toISOString()
  });
}
