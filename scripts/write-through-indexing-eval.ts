import {
  authorDocToSearchDocument,
  canonicalEntityToSearchDocument,
  editionDocToSearchDocument,
  resolveAuthorNames,
  workDocToSearchDocument
} from '../src/search/search-document-projection';
import { findSearchDependentsForAuthor } from '../src/search/search-index-dependencies';
import { createSearchIndexQueue } from '../src/search/write-through-indexing';
import type { AuthorDoc, EditionDoc, WorkDoc } from '../src/db/schema';
import type { CanonicalApEntity } from '../src/sync/activitypub-client';
import type { SearchDocument } from '../src/search/types';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createFakeDb(authorNames: Record<string, string>, records: { works?: WorkDoc[]; editions?: EditionDoc[] } = {}) {
  const lookups: string[] = [];

  return {
    lookups,
    authors: {
      findOne: (id: string) => ({
        exec: async () => {
          lookups.push(id);
          const name = authorNames[id];
          return name ? { id, name } : null;
        }
      })
    },
    works: {
      find: () => ({ exec: async () => records.works ?? [] })
    },
    editions: {
      find: () => ({ exec: async () => records.editions ?? [] })
    }
  } as any;
}

const timestamp = '2026-01-01T00:00:00.000Z';

const author: CanonicalApEntity = {
  kind: 'author',
  id: 'https://books.example/author/ursula',
  name: 'Ursula K. Le Guin',
  summary: 'Author of speculative fiction.'
};

const otherAuthor: CanonicalApEntity = {
  kind: 'author',
  id: 'https://books.example/author/octavia',
  name: 'Octavia E. Butler'
};

const work: CanonicalApEntity = {
  kind: 'work',
  id: 'https://books.example/work/dispossessed',
  title: 'The Dispossessed',
  summary: 'An ambiguous utopia.',
  authorIds: [author.id, author.id]
};

const edition: CanonicalApEntity = {
  kind: 'edition',
  id: 'https://books.example/edition/dispossessed-paperback',
  title: 'The Dispossessed',
  subtitle: 'A Novel',
  description: 'Paperback edition.',
  authorIds: [author.id],
  isbn13: '9780061054884',
  sourceUrl: 'https://books.example/edition/dispossessed-paperback'
};

const review: CanonicalApEntity = {
  kind: 'review',
  id: 'https://books.example/review/1',
  content: 'Great book.',
  editionId: edition.id,
  accountId: 'https://books.example/user/alice',
  published: timestamp
};

const authorDoc: AuthorDoc = {
  id: author.id,
  name: author.name,
  summary: author.summary,
  importedAt: timestamp,
  updatedAt: timestamp
};

const workDoc: WorkDoc = {
  id: work.id,
  title: work.title,
  summary: work.summary,
  authorIds: work.authorIds,
  importedAt: timestamp,
  updatedAt: timestamp
};

const unrelatedWorkDoc: WorkDoc = {
  id: 'https://books.example/work/kindred',
  title: 'Kindred',
  summary: 'A time-travel novel.',
  authorIds: [otherAuthor.id],
  importedAt: timestamp,
  updatedAt: timestamp
};

const editionDoc: EditionDoc = {
  id: edition.id,
  title: edition.title,
  subtitle: edition.subtitle,
  description: edition.description,
  authorIds: edition.authorIds,
  isbn13: edition.isbn13,
  sourceUrl: edition.sourceUrl,
  importedAt: timestamp,
  updatedAt: timestamp
};

const unrelatedEditionDoc: EditionDoc = {
  id: 'https://books.example/edition/kindred-paperback',
  title: 'Kindred',
  description: 'Paperback edition.',
  authorIds: [otherAuthor.id],
  sourceUrl: 'https://books.example/edition/kindred-paperback',
  importedAt: timestamp,
  updatedAt: timestamp
};

async function testAuthorNameResolutionDedupesLookups(): Promise<void> {
  const db = createFakeDb({ [author.id]: author.name });
  const names = await resolveAuthorNames(db, [author.id, author.id]);

  assert(names === author.name, 'Author names should resolve from DB names, not URI text');
  assert(db.lookups.length === 1, 'Duplicate author IDs should be looked up once');
}

async function testCanonicalEntitySearchDocumentUsesAuthorNames(): Promise<void> {
  const db = createFakeDb({ [author.id]: author.name });
  const doc = await canonicalEntityToSearchDocument(db, work, timestamp);

  assert(doc?.authorText === author.name, 'Work search document should use author names');
  assert(doc?.authorText.includes('http') === false, 'Work search document should not embed author URI text when name exists');
}

async function testLocalDocProjectionMatchesCanonicalProjection(): Promise<void> {
  const db = createFakeDb({ [author.id]: author.name });

  const canonicalAuthor = await canonicalEntityToSearchDocument(db, author, timestamp);
  const canonicalWork = await canonicalEntityToSearchDocument(db, work, timestamp);
  const canonicalEdition = await canonicalEntityToSearchDocument(db, edition, timestamp);

  const localAuthor = authorDocToSearchDocument(authorDoc);
  const localWork = await workDocToSearchDocument(db, workDoc);
  const localEdition = await editionDocToSearchDocument(db, editionDoc);

  assert(JSON.stringify(localAuthor) === JSON.stringify(canonicalAuthor), 'Author projection should match across write-through and rebuild paths');
  assert(JSON.stringify(localWork) === JSON.stringify(canonicalWork), 'Work projection should match across write-through and rebuild paths');
  assert(JSON.stringify(localEdition) === JSON.stringify(canonicalEdition), 'Edition projection should match across write-through and rebuild paths');
  assert(localWork.authorText === author.name, 'Rebuild work projection should include author names');
  assert(localEdition.authorText === author.name, 'Rebuild edition projection should include author names');
}

async function testMissingAuthorsFallbackSafely(): Promise<void> {
  const db = createFakeDb({});
  const doc = await workDocToSearchDocument(db, workDoc);

  assert(doc.authorText === author.id, 'Missing author names should fall back to stable author IDs');
}

async function testAuthorDependencyLookupFindsOnlyAffectedRecords(): Promise<void> {
  const db = createFakeDb(
    { [author.id]: author.name, [otherAuthor.id]: otherAuthor.name },
    { works: [workDoc, unrelatedWorkDoc], editions: [editionDoc, unrelatedEditionDoc] }
  );

  const dependents = await findSearchDependentsForAuthor(db, author.id);
  const ids = dependents.map((entity) => entity.id).sort();

  assert(ids.length === 2, 'Author dependency lookup should include affected work and edition only');
  assert(ids.includes(work.id), 'Author dependency lookup should include affected work');
  assert(ids.includes(edition.id), 'Author dependency lookup should include affected edition');
  assert(ids.includes(unrelatedWorkDoc.id) === false, 'Author dependency lookup should skip unrelated works');
  assert(ids.includes(unrelatedEditionDoc.id) === false, 'Author dependency lookup should skip unrelated editions');
}

async function testQueueLimitsConcurrencyAndSkipsReviews(): Promise<void> {
  const db = createFakeDb({ [author.id]: author.name });
  let active = 0;
  let maxActive = 0;
  const indexed: SearchDocument[] = [];

  const queue = createSearchIndexQueue({
    concurrency: 2,
    maxSize: 10,
    indexer: async (doc) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(10);
      indexed.push(doc);
      active -= 1;
    },
    logger: { error: () => undefined, warn: () => undefined }
  });

  queue.enqueue(db, author, timestamp);
  queue.enqueue(db, work, timestamp);
  queue.enqueue(db, edition, timestamp);
  queue.enqueue(db, review, timestamp);

  await delay(80);

  assert(indexed.length === 3, 'Queue should index authors, works, and editions only');
  assert(maxActive <= 2, 'Queue should respect configured concurrency');
  assert(indexed.every((doc) => doc.type !== undefined), 'Indexed documents should be valid search documents');
}

async function testQueueDedupesPendingJobs(): Promise<void> {
  const db = createFakeDb({ [author.id]: author.name });
  const indexed: SearchDocument[] = [];

  const queue = createSearchIndexQueue({
    concurrency: 1,
    maxSize: 10,
    indexer: async (doc) => {
      await delay(20);
      indexed.push(doc);
    },
    logger: { error: () => undefined, warn: () => undefined }
  });

  const workV1: CanonicalApEntity = { ...work, summary: 'Old summary.' };
  const workV2: CanonicalApEntity = { ...work, summary: 'New summary.' };

  queue.enqueue(db, author, timestamp);
  queue.enqueue(db, workV1, '2026-01-01T00:00:01.000Z');
  queue.enqueue(db, workV2, '2026-01-01T00:00:02.000Z');

  await delay(120);

  const workDocs = indexed.filter((doc) => doc.id === work.id);
  assert(workDocs.length === 1, 'Pending duplicate entity jobs should be collapsed');
  assert(workDocs[0].description === 'New summary.', 'Deduplicated pending job should keep newest entity payload');
}

async function testQueueAppliesCapacityLimit(): Promise<void> {
  const db = createFakeDb({ [author.id]: author.name });
  const warnings: unknown[] = [];

  const queue = createSearchIndexQueue({
    concurrency: 0,
    maxSize: 2,
    indexer: async () => undefined,
    logger: { error: () => undefined, warn: (...args: unknown[]) => { warnings.push(args); } }
  });

  queue.enqueue(db, { ...author, id: 'author:1' }, timestamp);
  queue.enqueue(db, { ...author, id: 'author:2' }, timestamp);
  queue.enqueue(db, { ...author, id: 'author:3' }, timestamp);

  assert(queue.pending() === 2, 'Queue should enforce max pending size');
  assert(warnings.length === 1, 'Queue should warn when dropping oldest pending job');
}

async function main(): Promise<void> {
  await testAuthorNameResolutionDedupesLookups();
  await testCanonicalEntitySearchDocumentUsesAuthorNames();
  await testLocalDocProjectionMatchesCanonicalProjection();
  await testMissingAuthorsFallbackSafely();
  await testAuthorDependencyLookupFindsOnlyAffectedRecords();
  await testQueueLimitsConcurrencyAndSkipsReviews();
  await testQueueDedupesPendingJobs();
  await testQueueAppliesCapacityLimit();
  console.log('Write-through indexing, projection, and dependency guardrails passed.');
}

await main();
