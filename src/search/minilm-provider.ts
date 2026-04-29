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

    return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true
    });
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

  const vector = embedText(text, 384);
  return vector.length === 384 ? vector : new Array(384).fill(0);
}

export function createMiniLMEmbeddingProvider(): EmbeddingProvider {
  return {
    id: 'minilm-l6-v2-q8-with-deterministic-fallback',
    dimensions: 384,
    embed: async (text: string) => {
      try {
        const extractor = await getExtractor();
        const output = await extractor(text, { pooling: 'mean', normalize: true });
        const vector = coerceVector(output);

        if (vector.length === 384) {
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
