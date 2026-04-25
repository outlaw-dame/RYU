import { registerEmbeddingProvider, resetEmbeddingProvider } from './embedding-provider';
import { createMiniLMProvider } from './embedding-adapters';

export async function initializeEmbeddings(): Promise<void> {
  try {
    const provider = createMiniLMProvider();

    // Probe once to ensure model loads and works
    await provider.embed('test');

    registerEmbeddingProvider(provider);
  } catch (err) {
    console.warn('MiniLM unavailable, falling back to deterministic embeddings', err);
    resetEmbeddingProvider();
  }
}
