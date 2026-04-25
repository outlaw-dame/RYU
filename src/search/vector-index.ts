import { embedText, cosineSimilarity, searchableText } from './embeddings';
import type { RankedSearchResult, SearchDocument } from './types';
import { initializeDatabase } from '@/db/client';

const vectorStore = new Map<string, { vector: number[]; doc: SearchDocument }>();
const MODEL = 'deterministic-v1';

function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

export async function indexDocument(doc: SearchDocument) {
  const db = await initializeDatabase();

  const text = searchableText(doc);
  const textHash = hashText(text);

  const existing = await db.searchvectors.findOne(doc.id).exec();

  let vector: number[];

  if (existing && existing.model === MODEL && existing.textHash === textHash) {
    vector = existing.vector;
  } else {
    vector = embedText(text);

    await db.searchvectors.upsert({
      id: doc.id,
      entityId: doc.id,
      entityType: doc.type,
      model: MODEL,
      dimensions: vector.length,
      textHash,
      vector,
      indexedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }).catch(() => {});
  }

  vectorStore.set(doc.id, { vector, doc });
}

export async function rebuildVectorIndex(getDoc: (id: string) => SearchDocument | null) {
  const db = await initializeDatabase();
  const all = await db.searchvectors.find().exec();

  for (const entry of all) {
    const doc = getDoc(entry.entityId);
    if (!doc) continue;

    vectorStore.set(entry.entityId, {
      vector: entry.vector,
      doc
    });
  }
}

function selectTopKCandidates(queryVector: number[], k = 200) {
  const scored: Array<{ id: string; score: number }> = [];

  for (const [id, { vector }] of vectorStore.entries()) {
    const score = cosineSimilarity(queryVector, vector);
    if (score > 0) scored.push({ id, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.id);
}

export function semanticSearchLocal(query: string, limit = 20): RankedSearchResult[] {
  const queryVector = embedText(query);

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
