import type { EmbeddingProvider } from './embedding-provider';

const pipelines = new Map<string, Promise<any>>();

async function getPipeline(model: string) {
  let existing = pipelines.get(model);

  if (!existing) {
    existing = import('@huggingface/transformers').then(async ({ pipeline }) => {
      return pipeline('feature-extraction', model);
    });
    pipelines.set(model, existing);
  }

  return existing;
}

function toNumberArray(output: any): number[] {
  const data = output?.data ?? output;
  return Array.from(data).map((value) => Number(value)).filter((value) => Number.isFinite(value));
}

export function createMiniLMProvider(): EmbeddingProvider {
  return {
    id: 'minilm-l6-v2',
    dimensions: 384,
    embed: async (text: string) => {
      const pipe = await getPipeline('Xenova/all-MiniLM-L6-v2');
      const output = await pipe(text, { pooling: 'mean', normalize: true });
      const vector = toNumberArray(output);

      if (vector.length !== 384) {
        throw new Error(`MiniLM produced invalid vector length: ${vector.length}`);
      }

      return vector;
    }
  };
}

export function createEmbeddingGemmaProvider(): EmbeddingProvider {
  return {
    id: 'embeddinggemma-v1',
    dimensions: 768,
    embed: async (text: string) => {
      const pipe = await getPipeline('google/embeddinggemma-300m');
      const output = await pipe(text, { pooling: 'mean', normalize: true });
      const vector = toNumberArray(output);

      if (vector.length <= 0) {
        throw new Error('EmbeddingGemma produced an empty vector');
      }

      return vector;
    }
  };
}
