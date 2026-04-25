import { embedText } from './embeddings';

export type EmbeddingProvider = {
  id: string;
  dimensions: number;
  embed(text: string): Promise<number[]> | number[];
};

const deterministicProvider: EmbeddingProvider = {
  id: 'deterministic-v1',
  dimensions: 128,
  embed: (text: string) => embedText(text)
};

let activeProvider: EmbeddingProvider = deterministicProvider;

export function getEmbeddingProvider(): EmbeddingProvider {
  return activeProvider;
}

export function registerEmbeddingProvider(provider: EmbeddingProvider): void {
  if (!provider.id || !Number.isFinite(provider.dimensions) || provider.dimensions <= 0) {
    throw new Error('Invalid embedding provider');
  }

  activeProvider = provider;
}

export function resetEmbeddingProvider(): void {
  activeProvider = deterministicProvider;
}
