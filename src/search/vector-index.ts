import { cosineSimilarity, searchableText } from './embeddings';
import type { RankedSearchResult, SearchDocument } from './types';
import { initializeDatabase, type RyuDatabase } from '../db/client';
import { getEmbeddingProvider, getEmbeddingProviderGeneration } from './embedding-provider';
import { hashText, vectorId } from './vector-utils';
import { authorDocToSearchDocument, editionDocToSearchDocument, workDocToSearchDocument, reviewDocToSearchDocument } from './search-document-projection';

type VectorStoreEntry = { vector: number[]; doc: SearchDocument; model: string; dimensions: number; dbName: string };

const vectorStore = new Map<string, VectorStoreEntry>();

function inMemoryVectorKey(dbName: string, docId: string): string {
  return `${dbName}:${docId}`;
}

export function clearInMemoryVectorIndex(): void {
  vectorStore.clear();
}

export function removeFromInMemoryVectorIndex(entityId: string): void {
  for (const [key, entry] of vectorStore.entries()) {
    if (entry.doc.id === entityId) {
      vectorStore.delete(key);
    }
  }
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
    if (entry.dbName === db.name && entry.model === provider.id && entry.dimensions === provider.dimensions) {
      vectorStore.delete(id);
    }
  }
}

export async function indexDocument(doc: SearchDocument, db?: RyuDatabase): Promise<void> {
  const database = db ?? await initializeDatabase();
  const provider = getEmbeddingProvider();
  const generationAtStart = getEmbeddingProviderGeneration();

  const text = searchableText(doc);
  const textHash = hashText(text);
  const id = vectorId(doc.id, provider.id, provider.dimensions);

  const existing = await database.searchvectors.findOne(id).exec();

  let vector: number[];

  if (existing && existing.model === provider.id && existing.dimensions === provider.dimensions && existing.textHash === textHash) {
    vector = existing.vector;
  } else {
    vector = await provider.embed(text);

    // Stale write protection: if provider changed while we were embedding, discard.
    if (getEmbeddingProviderGeneration() !== generationAtStart) {
      return;
    }

    if (vector.length !== provider.dimensions) {
      console.warn('Skipping search vector with invalid dimensions', {
        entityId: doc.id,
        model: provider.id,
        expectedDimensions: provider.dimensions,
        actualDimensions: vector.length
      });
      return;
    }

    await database.searchvectors.upsert({
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

  // Final stale write check before updating in-memory store
  if (getEmbeddingProviderGeneration() !== generationAtStart) {
    return;
  }

  vectorStore.set(inMemoryVectorKey(database.name, doc.id), {
    vector,
    doc,
    model: provider.id,
    dimensions: provider.dimensions,
    dbName: database.name
  });
}

/**
 * Warmup: load persisted vectors for the active provider into the in-memory store.
 * Resolves full SearchDocument metadata from RxDB so semantic results are
 * immediately display-ready (not blank placeholder docs).
 *
 * Uses batch DB queries (one per entity type) to avoid O(N) sequential roundtrips.
 *
 * Idempotent — safe to call multiple times. Skips vectors with wrong dimensions
 * and orphan vectors (persisted vector with no matching canonical entity in RxDB).
 *
 * Call this at app startup (after idle) to ensure semantic search is available
 * without waiting for full re-indexing.
 */
export async function warmSemanticVectorIndex(db?: RyuDatabase): Promise<{ loaded: number; skipped: number; orphans: number }> {
  const database = db ?? await initializeDatabase();
  const provider = getEmbeddingProvider();

  const all = await database.searchvectors
    .find({ selector: { model: provider.id, dimensions: provider.dimensions } })
    .exec();

  // Group vector entries by entity type for batch resolution.
  const authorIds: string[] = [];
  const editionIds: string[] = [];
  const workIds: string[] = [];
  const reviewIds: string[] = [];
  const validEntries: Array<{ entry: any; key: string }> = [];

  let skipped = 0;

  for (const entry of all) {
    if (entry.vector.length !== provider.dimensions) {
      skipped++;
      continue;
    }

    const key = inMemoryVectorKey(database.name, entry.entityId);
    const existing = vectorStore.get(key);
    if (existing && existing.model === provider.id && existing.dimensions === provider.dimensions) {
      continue;
    }

    validEntries.push({ entry, key });
    const entityType = entry.entityType as SearchDocument["type"];
    if (entityType === "author") authorIds.push(entry.entityId);
    else if (entityType === "edition") editionIds.push(entry.entityId);
    else if (entityType === "work") workIds.push(entry.entityId);
    else if (entityType === "review") reviewIds.push(entry.entityId);
  }

  // Batch-resolve all canonical entities in up to 4 queries.
  const [authorDocs, editionDocs, workDocs, reviewDocs] = await Promise.all([
    authorIds.length > 0
      ? database.authors.find({ selector: { id: { $in: authorIds } } }).exec().catch(() => [])
      : Promise.resolve([]),
    editionIds.length > 0
      ? database.editions.find({ selector: { id: { $in: editionIds } } }).exec().catch(() => [])
      : Promise.resolve([]),
    workIds.length > 0
      ? database.works.find({ selector: { id: { $in: workIds } } }).exec().catch(() => [])
      : Promise.resolve([]),
    reviewIds.length > 0
      ? database.reviews.find({ selector: { id: { $in: reviewIds } } }).exec().catch(() => [])
      : Promise.resolve([])
  ]);

  // Build lookup maps for O(1) resolution.
  const authorMap = new Map((authorDocs as any[]).map((d) => [d.id, d]));
  const editionMap = new Map((editionDocs as any[]).map((d) => [d.id, d]));
  const workMap = new Map((workDocs as any[]).map((d) => [d.id, d]));
  const reviewMap = new Map((reviewDocs as any[]).map((d) => [d.id, d]));
  const editionTitleCache = new Map<string, string>((editionDocs as any[]).map((d) => [d.id, d.title]));

  let loaded = 0;
  let orphans = 0;

  for (const { entry, key } of validEntries) {
    const entityType = entry.entityType as SearchDocument["type"];
    let doc: SearchDocument | null = null;

    try {
      if (entityType === "author") {
        const raw = authorMap.get(entry.entityId);
        doc = raw ? authorDocToSearchDocument(raw) : null;
      } else if (entityType === "edition") {
        const raw = editionMap.get(entry.entityId);
        doc = raw ? await editionDocToSearchDocument(database, raw) : null;
      } else if (entityType === "work") {
        const raw = workMap.get(entry.entityId);
        doc = raw ? await workDocToSearchDocument(database, raw) : null;
      } else if (entityType === "review") {
        const raw = reviewMap.get(entry.entityId);
        doc = raw ? await reviewDocToSearchDocument(database, raw, editionTitleCache) : null;
      }
    } catch (error) {
      console.error("Failed to project search document during warmup", {
        entityId: entry.entityId,
        entityType,
        error
      });
      doc = null;
    }

    if (!doc) {
      orphans++;
      continue;
    }

    vectorStore.set(key, {
      vector: entry.vector,
      doc,
      model: entry.model,
      dimensions: entry.dimensions,
      dbName: database.name
    });
    loaded++;
  }

  return { loaded, skipped, orphans };
}

export async function rebuildVectorIndex(getDoc: (id: string) => SearchDocument | null) {
  const db = await initializeDatabase();
  const provider = getEmbeddingProvider();

  for (const [id, entry] of vectorStore.entries()) {
    if (entry.dbName === db.name) vectorStore.delete(id);
  }

  const all = await db.searchvectors
    .find({ selector: { model: provider.id, dimensions: provider.dimensions } })
    .exec();

  for (const entry of all) {
    const doc = getDoc(entry.entityId);
    if (!doc) continue;

    vectorStore.set(inMemoryVectorKey(db.name, entry.entityId), {
      vector: entry.vector,
      doc,
      model: entry.model,
      dimensions: entry.dimensions,
      dbName: db.name
    });
  }
}

function selectTopKCandidates(dbName: string, queryVector: number[], k = 200) {
  const provider = getEmbeddingProvider();
  const scored: Array<{ id: string; score: number }> = [];

  for (const [id, { vector, model, dimensions, dbName: entryDbName }] of vectorStore.entries()) {
    if (entryDbName !== dbName || model !== provider.id || dimensions !== provider.dimensions || vector.length !== queryVector.length) continue;

    const score = cosineSimilarity(queryVector, vector);
    if (score > 0) scored.push({ id, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.id);
}

export async function semanticSearchLocal(query: string, limit = 20, db?: RyuDatabase): Promise<RankedSearchResult[]> {
  const database = db ?? await initializeDatabase();
  const provider = getEmbeddingProvider();
  const queryVector = await provider.embed(query);

  if (queryVector.length !== provider.dimensions) return [];

  const candidates = selectTopKCandidates(database.name, queryVector, 200);

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
