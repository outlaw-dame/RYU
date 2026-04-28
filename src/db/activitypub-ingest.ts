import type { SearchDocument } from "../search/types";
import { indexDocument } from "../search/vector-index";
import type { CanonicalApEntity, CanonicalApGraph } from "../sync/activitypub-client";
import { initializeDatabase, type RyuDatabase } from "./client";
import { enrichKnowledgeEntity } from "./entity-enrichment";

export type ActivityPubEntityStore = {
  upsertAuthor(entity: Extract<CanonicalApEntity, { kind: "author" }>): Promise<void>;
  upsertWork(entity: Extract<CanonicalApEntity, { kind: "work" }>): Promise<void>;
  upsertEdition(entity: Extract<CanonicalApEntity, { kind: "edition" }>): Promise<void>;
  upsertReview(entity: Extract<CanonicalApEntity, { kind: "review" }>): Promise<void>;
};

function nowIso(): string {
  return new Date().toISOString();
}

async function safeUpsert(collection: any, doc: any) {
  if (typeof collection.incrementalUpsert === "function") {
    await collection.incrementalUpsert(doc);
  } else {
    await collection.upsert(doc);
  }
}

async function writeEntityResolution(db: RyuDatabase, entity: CanonicalApEntity) {
  const timestamp = nowIso();
  await safeUpsert(db.entityresolutions, {
    id: entity.id,
    canonicalUri: entity.id,
    entityType: entity.kind,
    entityId: entity.id,
    resolvedAt: timestamp
  });
}

function toKnowledgeCandidate(entity: CanonicalApEntity) {
  switch (entity.kind) {
    case 'author':
      return { id: entity.id, kind: 'author' as const, label: entity.name };
    case 'work':
      return { id: entity.id, kind: 'work' as const, label: entity.title, authorLabels: entity.authorIds };
    case 'edition':
      return { id: entity.id, kind: 'edition' as const, label: entity.title, authorLabels: entity.authorIds };
    default:
      return null;
  }
}

function indexImportedSearchDocument(doc: SearchDocument): void {
  void indexDocument(doc).catch((error) => {
    console.error('Failed to index imported search document', {
      entityId: doc.id,
      entityType: doc.type,
      error
    });
  });
}

export function createRxDBActivityPubStore(db: RyuDatabase): ActivityPubEntityStore {
  return {
    async upsertAuthor(entity) {
      const timestamp = nowIso();
      await safeUpsert(db.authors, {
        id: entity.id,
        name: entity.name,
        summary: entity.summary,
        url: entity.url,
        importedAt: timestamp,
        updatedAt: timestamp
      });
      await writeEntityResolution(db, entity);
      indexImportedSearchDocument({
        id: entity.id,
        type: 'author',
        title: entity.name,
        description: entity.summary || '',
        authorText: entity.name,
        isbnText: '',
        enrichmentText: '',
        source: 'local',
        updatedAt: timestamp
      });
      const candidate = toKnowledgeCandidate(entity);
      if (candidate) void enrichKnowledgeEntity(candidate);
    },
    async upsertWork(entity) {
      const timestamp = nowIso();
      await safeUpsert(db.works, {
        id: entity.id,
        title: entity.title,
        summary: entity.summary,
        authorIds: entity.authorIds,
        url: entity.url,
        importedAt: timestamp,
        updatedAt: timestamp
      });
      await writeEntityResolution(db, entity);
      indexImportedSearchDocument({
        id: entity.id,
        type: 'work',
        title: entity.title,
        description: entity.summary || '',
        authorText: entity.authorIds.join(' '),
        isbnText: '',
        enrichmentText: '',
        source: 'local',
        updatedAt: timestamp
      });
      const candidate = toKnowledgeCandidate(entity);
      if (candidate) void enrichKnowledgeEntity(candidate);
    },
    async upsertEdition(entity) {
      const timestamp = nowIso();
      await safeUpsert(db.editions, {
        id: entity.id,
        title: entity.title,
        subtitle: entity.subtitle,
        description: entity.description,
        authorIds: entity.authorIds,
        workId: entity.workId,
        coverUrl: entity.coverUrl,
        isbn10: entity.isbn10,
        isbn13: entity.isbn13,
        sourceUrl: entity.sourceUrl,
        importedAt: timestamp,
        updatedAt: timestamp
      });
      await writeEntityResolution(db, entity);
      indexImportedSearchDocument({
        id: entity.id,
        type: 'edition',
        title: entity.title,
        description: entity.description || '',
        authorText: entity.authorIds.join(' '),
        isbnText: `${entity.isbn10 || ''} ${entity.isbn13 || ''}`.trim(),
        enrichmentText: entity.subtitle || '',
        source: 'local',
        updatedAt: timestamp
      });
      const candidate = toKnowledgeCandidate(entity);
      if (candidate) void enrichKnowledgeEntity(candidate);
    },
    async upsertReview(entity) {
      const timestamp = nowIso();
      await safeUpsert(db.reviews, {
        id: entity.id,
        title: entity.title,
        content: entity.content,
        editionId: entity.editionId,
        accountId: entity.accountId,
        rating: entity.rating,
        published: entity.published,
        importedAt: timestamp,
        updatedAt: timestamp
      });
      await writeEntityResolution(db, entity);
    }
  };
}

export async function getRxDBActivityPubStore(): Promise<ActivityPubEntityStore> {
  const db = await initializeDatabase();
  return createRxDBActivityPubStore(db);
}

export async function ingestActivityPubGraph(graph: CanonicalApGraph, store: ActivityPubEntityStore): Promise<void> {
  const entities = topoSortForRelations(graph.entities);

  for (const entity of entities) {
    switch (entity.kind) {
      case "author":
        await store.upsertAuthor(entity);
        break;
      case "work":
        await store.upsertWork(entity);
        break;
      case "edition":
        await store.upsertEdition(entity);
        break;
      case "review":
        await store.upsertReview(entity);
        break;
    }
  }
}

function topoSortForRelations(entities: CanonicalApEntity[]): CanonicalApEntity[] {
  const rank = {
    author: 0,
    work: 1,
    edition: 2,
    review: 3
  } as const;

  return [...entities].sort((a, b) => rank[a.kind] - rank[b.kind]);
}
