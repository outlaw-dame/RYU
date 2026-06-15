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

/**
 * Generation counter incremented on every provider change.
 * Used by vector-index.ts for stale write protection so that
 * an in-flight embedding from an old provider cannot pollute
 * the current index after a runtime switch.
 */
let providerGeneration = 0;

export function getEmbeddingProvider(): EmbeddingProvider {
  return activeProvider;
}

export function getEmbeddingProviderGeneration(): number {
  return providerGeneration;
}

export function registerEmbeddingProvider(provider: EmbeddingProvider): void {
  if (!provider.id || !Number.isFinite(provider.dimensions) || provider.dimensions <= 0) {
    throw new Error('Invalid embedding provider');
  }

  // Only advance generation if the provider identity actually changed.
  if (provider.id !== activeProvider.id || provider.dimensions !== activeProvider.dimensions) {
    providerGeneration++;
  }

  activeProvider = provider;
}

export function resetEmbeddingProvider(): void {
  // Only advance generation if we are actually changing providers.
  if (activeProvider.id !== deterministicProvider.id || activeProvider.dimensions !== deterministicProvider.dimensions) {
    providerGeneration++;
  }

  activeProvider = deterministicProvider;
}
