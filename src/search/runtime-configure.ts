import { registerEmbeddingProvider, resetEmbeddingProvider } from './embedding-provider';
import { clearRerankerProvider, registerRerankerProvider } from './reranker-provider';
import { canAttemptEmbeddingGemma, canAttemptMiniLM, getDeviceCapabilityTier } from './device-capabilities';
import { updateSearchRuntimeStatus, type ActiveEmbeddingProviderId } from './runtime-status';
import { getSearchRuntimeSettings, type SearchRuntimeSettings } from './runtime-settings';

let applyGeneration = 0;

function reportRuntimeInitializationError(runtime: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[search-runtime] Failed to initialize ${runtime}.`, error);
  return message;
}

async function loadEmbeddingProvider(runtime: SearchRuntimeSettings['embeddingRuntime']) {
  if (runtime === 'embeddinggemma') {
    const module = await import('./embeddinggemma-provider');
    return {
      provider: module.createEmbeddingGemmaProvider(),
      activeEmbeddingProvider: 'embeddinggemma' as const
    };
  }

  if (runtime === 'minilm') {
    const module = await import('./minilm-provider');
    return {
      provider: module.createMiniLMEmbeddingProvider(),
      activeEmbeddingProvider: 'minilm' as const
    };
  }

  return null;
}

async function loadRerankerProvider(settings: SearchRuntimeSettings) {
  if (settings.rerankerRuntime === 'qwen3') {
    const module = await import('./qwen-reranker-provider');
    return module.createQwen3Reranker();
  }

  if (settings.rerankerRuntime === 'jina' && settings.jinaRerankerUrl) {
    const module = await import('./jina-reranker-provider');
    return module.createJinaReranker(settings.jinaRerankerUrl);
  }

  return null;
}

export function applySearchRuntimeSettings(settings: SearchRuntimeSettings = getSearchRuntimeSettings()): void {
  const generation = ++applyGeneration;
  const deviceTier = getDeviceCapabilityTier();
  let activeEmbeddingProvider: ActiveEmbeddingProviderId = 'deterministic';
  let fallbackReason: string | undefined;
  let requestedEmbeddingRuntime: SearchRuntimeSettings['embeddingRuntime'] = settings.embeddingRuntime;

  if (settings.embeddingRuntime === 'auto') {
    if (canAttemptEmbeddingGemma()) {
      requestedEmbeddingRuntime = 'embeddinggemma';
    } else if (canAttemptMiniLM()) {
      requestedEmbeddingRuntime = 'minilm';
      fallbackReason = 'EmbeddingGemma skipped by device capability check.';
    } else {
      requestedEmbeddingRuntime = 'deterministic';
      fallbackReason = 'Enhanced embedding runtimes unavailable in this browser.';
    }
  }

  resetEmbeddingProvider();
  clearRerankerProvider();

  let activeRerankerProvider = 'off' as SearchRuntimeSettings['rerankerRuntime'];

  if (settings.rerankerRuntime === 'qwen3' || (settings.rerankerRuntime === 'jina' && settings.jinaRerankerUrl)) {
    activeRerankerProvider = settings.rerankerRuntime;
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

  if (requestedEmbeddingRuntime === 'embeddinggemma' || requestedEmbeddingRuntime === 'minilm') {
    void loadEmbeddingProvider(requestedEmbeddingRuntime)
      .then((result) => {
        if (!result || generation !== applyGeneration) {
          return;
        }

        registerEmbeddingProvider(result.provider);
        updateSearchRuntimeStatus({
          activeEmbeddingProvider: result.activeEmbeddingProvider,
          lastFallbackReason: fallbackReason,
          lastError: undefined,
          lastAppliedAt: new Date().toISOString()
        });
      })
      .catch((error) => {
        if (generation !== applyGeneration) {
          return;
        }

        const message = reportRuntimeInitializationError(requestedEmbeddingRuntime, error);

        resetEmbeddingProvider();
        updateSearchRuntimeStatus({
          activeEmbeddingProvider: 'deterministic-fallback',
          lastFallbackReason: `Unable to initialize ${requestedEmbeddingRuntime}. Falling back to deterministic embeddings.`,
          lastError: message,
          lastAppliedAt: new Date().toISOString()
        });
      });
  }

  if (activeRerankerProvider !== 'off') {
    void loadRerankerProvider(settings)
      .then((provider) => {
        if (!provider || generation !== applyGeneration) {
          return;
        }

        registerRerankerProvider(provider);
        updateSearchRuntimeStatus({
          activeRerankerProvider,
          lastError: undefined,
          lastAppliedAt: new Date().toISOString()
        });
      })
      .catch((error) => {
        if (generation !== applyGeneration) {
          return;
        }

        const message = reportRuntimeInitializationError(settings.rerankerRuntime, error);

        clearRerankerProvider();
        updateSearchRuntimeStatus({
          activeRerankerProvider: 'off',
          lastFallbackReason: `Unable to initialize ${settings.rerankerRuntime}.`,
          lastError: message,
          lastAppliedAt: new Date().toISOString()
        });
      });
  }
}
