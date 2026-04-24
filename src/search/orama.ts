import { create, insertMultiple, search as oramaSearch } from '@orama/orama';
import { initializeDatabase } from '@/db/client';

let orama: any;

function rank(doc: any): number {
  let score = 0;
  if (doc.title) score += 5;
  if (doc.description) score += 2;
  if (doc.type === 'edition') score += 3;
  if (doc.type === 'work') score += 2;
  if (doc.type === 'author') score += 1;
  return score;
}

function dedupe(results: any[]) {
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

export async function getOrama() {
  if (orama) return orama;

  orama = await create({
    schema: {
      id: 'string',
      type: 'string',
      title: 'string',
      description: 'string'
    }
  });

  const db = await initializeDatabase();

  const editions = await db.editions.find().exec();
  const works = await db.works.find().exec();
  const authors = await db.authors.find().exec();

  const docs = [
    ...editions.map((d: any) => ({ id: d.id, type: 'edition', title: d.title, description: d.description || '' })),
    ...works.map((w: any) => ({ id: w.id, type: 'work', title: w.title, description: w.summary || '' })),
    ...authors.map((a: any) => ({ id: a.id, type: 'author', title: a.name, description: '' }))
  ];

  await insertMultiple(orama, docs);

  return orama;
}

export async function searchOrama(query: string) {
  const db = await getOrama();

  const res = await oramaSearch(db, { term: query, limit: 20 });

  const ranked = res.hits
    .map((h: any) => ({ ...h.document, score: rank(h.document) }))
    .sort((a: any, b: any) => b.score - a.score);

  return dedupe(ranked);
}
