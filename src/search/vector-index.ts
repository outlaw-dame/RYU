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

  if (
    existing &&
    existing.model === MODEL &&
    existing.textHash === textHash
  ) {
    vector = existing.vector;
  } else {
    vector = embedText(text);

    await db.searchvectors
      .upsert({
        id: doc.id,
        entityId: doc.id,
        entityType: doc.type,
        model: MODEL,
        dimensions: vector.length,
        textHash,
        vector,
        indexedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .catch(() => {});
  }

  vectorStore.set(doc.id, { vector, doc });
}

export function removeDocument(id: string) {
  vectorStore.delete(id);
}

export async function rebuildVectorIndex() {
  const db = await initializeDatabase();
  const all = await db.searchvectors.find().exec();

  for (const entry of all) {
    vectorStore.set(entry.id, {
      vector: entry.vector,
      doc: null as any
    });
  }
}

export function semanticSearchLocal(query: string, limit = 20): RankedSearchResult[] {
  const queryVector = embedText(query);

  const results: RankedSearchResult[] = [];

  for (const { vector, doc } of vectorStore.values()) {
    if (!doc) continue;

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
