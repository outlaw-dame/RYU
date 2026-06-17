import { registerEmbeddingProvider, resetEmbeddingProvider } from './embedding-provider';
import { clearRerankerProvider, registerRerankerProvider } from './reranker-provider';
import { canAttemptEmbeddingGemma, canAttemptMiniLM, getDeviceCapabilityTier } from './device-capabilities';
import { updateSearchRuntimeStatus, type ActiveEmbeddingProviderId } from './runtime-status';
import { getSearchRuntimeSettings, type SearchRuntimeSettings } from './runtime-settings';
import {
  hasStorageHeadroomFor,
  isLowMemoryEnvironment,
  probeStorageQuota
} from './model-lifecycle/storageQuota';
import { getEmbeddingArtifactRecord } from './model-lifecycle/modelRegistry';
import { markDisabled, resetModelStatus } from './model-lifecycle/modelStatus';

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

  // Phase 14: low-memory adaptive fallback. Even if the device tier permits
  // an enhanced model, we downgrade if the JS heap is currently pressured.
  // EmbeddingGemma -> MiniLM, MiniLM -> deterministic.
  if (requestedEmbeddingRuntime === 'embeddinggemma' && isLowMemoryEnvironment()) {
    requestedEmbeddingRuntime = canAttemptMiniLM() ? 'minilm' : 'deterministic';
    fallbackReason = 'Low memory headroom — falling back from EmbeddingGemma.';
  }
  if (requestedEmbeddingRuntime === 'minilm' && isLowMemoryEnvironment()) {
    // MiniLM is small, but if even MiniLM cannot run we drop to deterministic.
    requestedEmbeddingRuntime = 'deterministic';
    fallbackReason = 'Low memory headroom — falling back from MiniLM.';
  }

  resetEmbeddingProvider();
  clearRerankerProvider();

  // Phase 14: when the user explicitly picks 'deterministic' (Enhanced Search
  // turned off) mark the heavy artifacts as disabled so the UI surface
  // reflects the chosen state immediately rather than showing stale 'ready'.
  if (settings.embeddingRuntime === 'deterministic') {
    markDisabled('minilm');
    markDisabled('embeddinggemma');
  } else {
    // Returning from disabled to auto: reset statuses so the next load
    // transitions cleanly through downloading/ready.
    resetModelStatus('minilm');
    resetModelStatus('embeddinggemma');
  }

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
    const targetRuntime = requestedEmbeddingRuntime;
    void (async () => {
      // Phase 14: storage-quota gating. We fall back BEFORE attempting to
      // download a multi-hundred-megabyte artifact when the origin quota
      // does not have headroom. Probe is async-tolerant — never throws.
      const estimate = await probeStorageQuota();
      const artifact = getEmbeddingArtifactRecord(targetRuntime);
      if (!hasStorageHeadroomFor(estimate, artifact)) {
        if (generation !== applyGeneration) return;
        resetEmbeddingProvider();
        markDisabled(targetRuntime);
        updateSearchRuntimeStatus({
          activeEmbeddingProvider: 'deterministic-fallback',
          lastFallbackReason: `Insufficient storage to download ${artifact.displayName}. Falling back to deterministic embeddings.`,
          lastError: undefined,
          lastAppliedAt: new Date().toISOString()
        });
        return;
      }

      try {
        const result = await loadEmbeddingProvider(targetRuntime);
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
      } catch (error) {
        if (generation !== applyGeneration) {
          return;
        }

        const message = reportRuntimeInitializationError(targetRuntime, error);

        resetEmbeddingProvider();
        updateSearchRuntimeStatus({
          activeEmbeddingProvider: 'deterministic-fallback',
          lastFallbackReason: `Unable to initialize ${targetRuntime}. Falling back to deterministic embeddings.`,
          lastError: message,
          lastAppliedAt: new Date().toISOString()
        });
      }
    })();
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
