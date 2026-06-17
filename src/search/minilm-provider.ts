import type { EmbeddingProvider } from './embedding-provider';
import { embedText } from './embeddings';
import { updateSearchRuntimeStatus } from './runtime-status';
import {
  markDownloading,
  markFailed,
  markReady,
  registerExtractorResetHook
} from './model-lifecycle';
import { getEmbeddingArtifactRecord } from './model-lifecycle/modelRegistry';

let extractorPromise: Promise<any> | null = null;

// Register a reset hook so clearAllLocalAIArtifacts can drop the cached
// pipeline. Idempotent — registering the same callback identity twice is
// a no-op because the registry is a Set.
registerExtractorResetHook(() => {
  extractorPromise = null;
});

const ARTIFACT = getEmbeddingArtifactRecord('minilm');

async function getExtractor(): Promise<any> {
  extractorPromise ??= (async () => {
    // State transition: idle -> downloading. We do not yet have a
    // progress callback because transformers.js v3 surfaces it
    // inconsistently; we report progress=0 to mean "in flight".
    markDownloading(ARTIFACT.id, 0, 0);

    try {
      const transformers = (await import('@huggingface/transformers')) as any;
      const pipeline = transformers.pipeline;

      if (typeof pipeline !== 'function') {
        throw new Error('Transformers.js pipeline API unavailable');
      }

      const extractor = await pipeline('feature-extraction', ARTIFACT.modelName, {
        quantized: true
      });

      markReady(ARTIFACT.id, ARTIFACT.pinnedRevision);
      return extractor;
    } catch (error) {
      markFailed(ARTIFACT.id, error);
      throw error;
    }
  })().catch((error) => {
    extractorPromise = null;
    throw error;
  });

  return extractorPromise;
}

function coerceVector(output: any): number[] {
  const data = output?.data ?? output;
  if (!data || typeof data[Symbol.iterator] !== 'function') return [];
  return Array.from(data as Iterable<number>, Number);
}

function fallback(text: string, reason: string, error?: unknown): number[] {
  updateSearchRuntimeStatus({
    activeEmbeddingProvider: 'deterministic-fallback',
    lastFallbackReason: reason,
    lastError: error instanceof Error ? error.message : undefined
  });

  const vector = embedText(text, ARTIFACT.dimensions);
  return vector.length === ARTIFACT.dimensions ? vector : new Array(ARTIFACT.dimensions).fill(0);
}

export function createMiniLMEmbeddingProvider(): EmbeddingProvider {
  return {
    id: 'minilm-l6-v2-q8-with-deterministic-fallback',
    dimensions: ARTIFACT.dimensions,
    embed: async (text: string) => {
      try {
        const extractor = await getExtractor();
        const output = await extractor(text, { pooling: 'mean', normalize: true });
        const vector = coerceVector(output);

        if (vector.length === ARTIFACT.dimensions) {
          updateSearchRuntimeStatus({
            activeEmbeddingProvider: 'minilm',
            lastFallbackReason: undefined,
            lastError: undefined
          });
          return vector;
        }

        return fallback(text, 'MiniLM returned invalid vector dimensions.');
      } catch (error) {
        return fallback(text, 'MiniLM failed to load or execute.', error);
      }
    }
  };
}
