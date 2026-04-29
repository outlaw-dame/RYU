import { create, insert, search as oramaSearch } from '@orama/orama';
import { initializeDatabase, type RyuDatabase } from '../db/client';
import type { AuthorDoc, EditionDoc, WorkDoc } from '../db/schema';
import { rankLexical, dedupe } from './ranking';
import {
  authorDocToSearchDocument,
  editionDocToSearchDocument,
  workDocToSearchDocument
} from './search-document-projection';
import { indexDocument } from './vector-index';
import type { SearchDocument } from './types';

async function createIndex() {
  return create({
    schema: {
      id: 'string',
      type: 'string',
      title: 'string',
      description: 'string',
      authorText: 'string',
      isbnText: 'string',
      enrichmentText: 'string'
    }
  });
}

async function addDoc(index: any, db: RyuDatabase, doc: SearchDocument): Promise<void> {
  await insert(index, doc);
  await indexDocument(doc, db);
}

export async function getOrama(db?: RyuDatabase) {
  const database = db ?? await initializeDatabase();
  const index = await createIndex();

  const editions = await database.editions.find().exec() as EditionDoc[];
  const works = await database.works.find().exec() as WorkDoc[];
  const authors = await database.authors.find().exec() as AuthorDoc[];

  for (const edition of editions) {
    await addDoc(index, database, await editionDocToSearchDocument(database, edition));
  }

  for (const work of works) {
    await addDoc(index, database, await workDocToSearchDocument(database, work));
  }

  for (const author of authors) {
    await addDoc(index, database, authorDocToSearchDocument(author));
  }

  return index;
}

export async function searchOrama(query: string, db?: RyuDatabase) {
  if (!query || query.length < 2) return [];

  const index = await getOrama(db);

  const res = await oramaSearch(index, {
    term: query,
    limit: 20
  });

  const docs = res.hits.map((h: any) => h.document);

  return dedupe(rankLexical(docs, query));
}
