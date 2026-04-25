import { initializeDatabase } from '@/db/client';
import { indexDocument } from './vector-index';
import { mapEditionToSearchDocument, mapWorkToSearchDocument, mapAuthorToSearchDocument } from './document-mapper';

const BATCH_SIZE = 25;
const DELAY_MS = 50;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function reindexAllDocuments(): Promise<void> {
  const db = await initializeDatabase();

  const editions = await db.editions.find().exec();
  const works = await db.works.find().exec();
  const authors = await db.authors.find().exec();

  const tasks = [
    ...editions.map((d) => () => indexDocument(mapEditionToSearchDocument(d))),
    ...works.map((w) => () => indexDocument(mapWorkToSearchDocument(w))),
    ...authors.map((a) => () => indexDocument(mapAuthorToSearchDocument(a)))
  ];

  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(batch.map((task) => task()));

    await sleep(DELAY_MS);
  }
}
