import type { EmbeddingProvider } from './embedding-provider';

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
    id: 'minilm-l6-v2-q8',
    dimensions: 384,
    embed: async (text: string) => {
      const extractor = await getExtractor();
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      const vector = coerceVector(output);

      if (vector.length !== 384) {
        throw new Error('MiniLM embedding returned invalid dimensions');
      }

      return vector;
    }
  };
}
