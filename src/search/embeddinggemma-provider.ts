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
// pipeline. Idempotent.
registerExtractorResetHook(() => {
  extractorPromise = null;
});

const ARTIFACT = getEmbeddingArtifactRecord('embeddinggemma');

async function getExtractor(): Promise<any> {
  extractorPromise ??= (async () => {
    markDownloading(ARTIFACT.id, 0, 0);

    try {
      const transformers = (await import('@huggingface/transformers')) as any;
      const pipeline = transformers.pipeline;

      if (typeof pipeline !== 'function') {
        throw new Error('Transformers.js pipeline API unavailable');
      }

      const extractor = await pipeline('feature-extraction', ARTIFACT.modelName, {
        dtype: 'q8'
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

function normalizeVector(values: number[]): number[] {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) return values;
  return values.map((value) => value / magnitude);
}

function coerceVector(output: any): number[] {
  const data = output?.data ?? output;
  if (!data || typeof data[Symbol.iterator] !== 'function') return [];
  return normalizeVector(Array.from(data as Iterable<number>, Number));
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

export function createEmbeddingGemmaProvider(): EmbeddingProvider {
  return {
    id: 'embeddinggemma-300m-q8-with-deterministic-fallback',
    dimensions: ARTIFACT.dimensions,
    embed: async (text: string) => {
      try {
        const extractor = await getExtractor();
        const output = await extractor(`task: search result | query: ${text}`, {
          pooling: 'mean',
          normalize: true
        });
        const vector = coerceVector(output);

        if (vector.length === ARTIFACT.dimensions) {
          updateSearchRuntimeStatus({
            activeEmbeddingProvider: 'embeddinggemma',
            lastFallbackReason: undefined,
            lastError: undefined
          });
          return vector;
        }

        return fallback(text, 'EmbeddingGemma returned invalid vector dimensions.');
      } catch (error) {
        return fallback(text, 'EmbeddingGemma failed to load or execute.', error);
      }
    }
  };
}
