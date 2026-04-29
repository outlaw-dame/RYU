import type { EmbeddingProvider } from './embedding-provider';
import { embedText } from './embeddings';
import { updateSearchRuntimeStatus } from './runtime-status';

let extractorPromise: Promise<any> | null = null;

async function getExtractor(): Promise<any> {
  extractorPromise ??= (async () => {
    const transformers = (await import('@huggingface/transformers')) as any;
    const pipeline = transformers.pipeline;

    if (typeof pipeline !== 'function') {
      throw new Error('Transformers.js pipeline API unavailable');
    }

    return pipeline('feature-extraction', 'google/embeddinggemma-300m', {
      dtype: 'q8'
    });
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

  const vector = embedText(text, 768);
  return vector.length === 768 ? vector : new Array(768).fill(0);
}

export function createEmbeddingGemmaProvider(): EmbeddingProvider {
  return {
    id: 'embeddinggemma-300m-q8-with-deterministic-fallback',
    dimensions: 768,
    embed: async (text: string) => {
      try {
        const extractor = await getExtractor();
        const output = await extractor(`task: search result | query: ${text}`, {
          pooling: 'mean',
          normalize: true
        });
        const vector = coerceVector(output);

        if (vector.length === 768) {
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
