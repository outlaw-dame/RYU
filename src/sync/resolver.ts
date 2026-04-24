import { ingestActivityPubGraph, type ActivityPubEntityStore } from "../db/activitypub-ingest";
import { getDatabase } from "../db/client";
import type { AuthorDoc, EditionDoc, EntityResolutionDoc, StatusDoc, WorkDoc } from "../db/schema";
import { ActivityPubClient, type CanonicalApEntity, type CanonicalApGraph } from "./activitypub-client";

export type ImportedEdition = {
  id: string;
  title: string;
  author?: string;
  coverUrl?: string;
  sourceUrl: string;
};

export class ActivityPubResolver {
  private readonly client = new ActivityPubClient();

  async fetchGraph(uri: string): Promise<CanonicalApGraph> {
    return this.client.fetchGraph(uri);
  }

  async importEditionFromUrl(uri: string): Promise<ImportedEdition> {
    const graph = await this.client.fetchGraph(uri);
    const edition = graph.entities.find((entity): entity is Extract<CanonicalApEntity, { kind: "edition" }> => {
      return entity.kind === "edition" && entity.id === graph.rootId;
    });

    if (!edition) {
      throw new Error("ActivityPub URL did not resolve to an Edition");
    }

    const importedAt = new Date().toISOString();
    const db = await getDatabase();
    const store = createRxActivityPubStore(db, importedAt);
    await ingestActivityPubGraph(graph, store);

    const authors = graph.entities.filter((entity): entity is Extract<CanonicalApEntity, { kind: "author" }> => {
      return entity.kind === "author" && edition.authorIds.includes(entity.id);
    });

    return {
      id: edition.id,
      title: edition.title,
      author: authors.map((author) => author.name).join(", ") || undefined,
      coverUrl: edition.coverUrl,
      sourceUrl: edition.sourceUrl
    };
  }
}

function createRxActivityPubStore(db: Awaited<ReturnType<typeof getDatabase>>, importedAt: string): ActivityPubEntityStore {
  return {
    async upsertAuthor(entity) {
      const doc: AuthorDoc = {
        id: entity.id,
        apId: entity.id,
        name: entity.name,
        summary: entity.summary,
        url: entity.url,
        importedAt,
        updatedAt: importedAt
      };

      await db.authors.upsert(doc);
      await db.entityresolutions.upsert(toResolution("author", entity.id, entity.id, importedAt));
    },

    async upsertWork(entity) {
      const doc: WorkDoc = {
        id: entity.id,
        apId: entity.id,
        title: entity.title,
        summary: entity.summary,
        url: entity.url,
        authorIds: entity.authorIds,
        importedAt,
        updatedAt: importedAt
      };

      await db.works.upsert(doc);
      await db.entityresolutions.upsert(toResolution("work", entity.id, entity.id, importedAt));
    },

    async upsertEdition(entity) {
      const doc: EditionDoc = {
        id: entity.id,
        apId: entity.id,
        title: entity.title,
        subtitle: entity.subtitle,
        description: entity.description,
        authorIds: entity.authorIds,
        workId: entity.workId,
        coverUrl: entity.coverUrl,
        isbn10: entity.isbn10,
        isbn13: entity.isbn13,
        sourceUrl: entity.sourceUrl,
        importedAt,
        updatedAt: importedAt
      };

      await db.editions.upsert(doc);
      await db.entityresolutions.upsert(toResolution("edition", entity.id, entity.id, importedAt));
    },

    async upsertReview(entity) {
      const doc: StatusDoc = {
        id: entity.id,
        accountId: entity.accountId,
        editionId: entity.editionId,
        type: "Review",
        content: entity.content,
        publishedAt: entity.published,
        updatedAt: importedAt
      };

      await db.statuses.upsert(doc);
      await db.entityresolutions.upsert(toResolution("status", entity.id, entity.id, importedAt));
    }
  };
}

function toResolution(
  entityType: EntityResolutionDoc["entityType"],
  canonicalUri: string,
  entityId: string,
  resolvedAt: string
): EntityResolutionDoc {
  return {
    id: `${entityType}:${canonicalUri}`,
    canonicalUri,
    entityType,
    entityId,
    resolvedAt
  };
}
