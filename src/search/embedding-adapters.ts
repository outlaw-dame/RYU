import type { EmbeddingProvider } from './embedding-provider';

let pipeline: any;

async function getPipeline(model: string) {
  if (!pipeline) {
    const { pipeline: hfPipeline } = await import('@huggingface/transformers');
    pipeline = await hfPipeline('feature-extraction', model);
  }
  return pipeline;
}

export function createMiniLMProvider(): EmbeddingProvider {
  return {
    id: 'minilm-l6-v2',
    dimensions: 384,
    embed: async (text: string) => {
      try {
        const pipe = await getPipeline('Xenova/all-MiniLM-L6-v2');
        const output = await pipe(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data || output);
      } catch {
        throw new Error('MiniLM embedding failed');
      }
    }
  };
}

export function createEmbeddingGemmaProvider(): EmbeddingProvider {
  return {
    id: 'embeddinggemma-v1',
    dimensions: 768,
    embed: async (text: string) => {
      try {
        const pipe = await getPipeline('google/embeddinggemma-300m');
        const output = await pipe(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data || output);
      } catch {
        throw new Error('EmbeddingGemma unavailable or gated');
      }
    }
  };
}
