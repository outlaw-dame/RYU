import { cosineSimilarity, searchableText } from './embeddings';
import type { RankedSearchResult, SearchDocument } from './types';
import { initializeDatabase } from '../db/client';
import { getEmbeddingProvider } from './embedding-provider';

const vectorStore = new Map<string, { vector: number[]; doc: SearchDocument; model: string; dimensions: number }>();

function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

function vectorId(entityId: string, model: string, dimensions: number): string {
  return `${model}:${dimensions}:${entityId}`;
}

export function clearInMemoryVectorIndex(): void {
  vectorStore.clear();
}

export async function clearPersistedVectorsForCurrentProvider(): Promise<void> {
  const db = await initializeDatabase();
  const provider = getEmbeddingProvider();
  const docs = await db.searchvectors
    .find({ selector: { model: provider.id, dimensions: provider.dimensions } })
    .exec();

  await Promise.all(docs.map((doc: any) => doc.remove().catch((error: unknown) => {
    console.error('Failed to remove persisted search vector', {
      id: doc.id,
      model: provider.id,
      dimensions: provider.dimensions,
      error
    });
  })));

  for (const [id, entry] of vectorStore.entries()) {
    if (entry.model === provider.id && entry.dimensions === provider.dimensions) {
      vectorStore.delete(id);
    }
  }
}

export async function indexDocument(doc: SearchDocument) {
  const db = await initializeDatabase();
  const provider = getEmbeddingProvider();

  const text = searchableText(doc);
  const textHash = hashText(text);
  const id = vectorId(doc.id, provider.id, provider.dimensions);

  const existing = await db.searchvectors.findOne(id).exec();

  let vector: number[];

  if (existing && existing.model === provider.id && existing.dimensions === provider.dimensions && existing.textHash === textHash) {
    vector = existing.vector;
  } else {
    vector = await provider.embed(text);

    if (vector.length !== provider.dimensions) {
      console.warn('Skipping search vector with invalid dimensions', {
        entityId: doc.id,
        model: provider.id,
        expectedDimensions: provider.dimensions,
        actualDimensions: vector.length
      });
      return;
    }

    await db.searchvectors.upsert({
      id,
      entityId: doc.id,
      entityType: doc.type,
      model: provider.id,
      dimensions: vector.length,
      textHash,
      vector,
      indexedAt: existing?.indexedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }).catch((error: unknown) => {
      console.error('Failed to persist search vector', {
        id,
        entityId: doc.id,
        entityType: doc.type,
        model: provider.id,
        dimensions: provider.dimensions,
        error
      });
    });
  }

  vectorStore.set(doc.id, { vector, doc, model: provider.id, dimensions: provider.dimensions });
}

export async function rebuildVectorIndex(getDoc: (id: string) => SearchDocument | null) {
  const db = await initializeDatabase();
  const provider = getEmbeddingProvider();
  vectorStore.clear();

  const all = await db.searchvectors
    .find({ selector: { model: provider.id, dimensions: provider.dimensions } })
    .exec();

  for (const entry of all) {
    const doc = getDoc(entry.entityId);
    if (!doc) continue;

    vectorStore.set(entry.entityId, {
      vector: entry.vector,
      doc,
      model: entry.model,
      dimensions: entry.dimensions
    });
  }
}

function selectTopKCandidates(queryVector: number[], k = 200) {
  const provider = getEmbeddingProvider();
  const scored: Array<{ id: string; score: number }> = [];

  for (const [id, { vector, model, dimensions }] of vectorStore.entries()) {
    if (model !== provider.id || dimensions !== provider.dimensions || vector.length !== queryVector.length) continue;

    const score = cosineSimilarity(queryVector, vector);
    if (score > 0) scored.push({ id, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.id);
}

export async function semanticSearchLocal(query: string, limit = 20): Promise<RankedSearchResult[]> {
  const provider = getEmbeddingProvider();
  const queryVector = await provider.embed(query);

  if (queryVector.length !== provider.dimensions) return [];

  const candidates = selectTopKCandidates(queryVector, 200);

  const results: RankedSearchResult[] = [];

  for (const id of candidates) {
    const entry = vectorStore.get(id);
    if (!entry) continue;

    const { vector, doc } = entry;
    const score = cosineSimilarity(queryVector, vector);

    if (score > 0.1) {
      results.push({
        ...doc,
        score,
        semanticScore: score
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
