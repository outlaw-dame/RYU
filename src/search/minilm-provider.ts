import type { EmbeddingProvider } from './embedding-provider';
import { embedText } from './embeddings';

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

export function createMiniLMEmbeddingProvider(): EmbeddingProvider {
  return {
    id: 'minilm-l6-v2-q8-with-deterministic-fallback',
    dimensions: 384,
    embed: async (text: string) => {
      try {
        const extractor = await getExtractor();
        const output = await extractor(text, { pooling: 'mean', normalize: true });
        const vector = coerceVector(output);

        if (vector.length === 384) return vector;
      } catch {
        // Enhanced semantic search should degrade to deterministic search, not fail the query.
      }

      const fallback = embedText(text, 384);
      return fallback.length === 384 ? fallback : new Array(384).fill(0);
    }
  };
}
