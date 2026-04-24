import { getDatabase } from "../db/client";
import type { AuthorDoc, EditionDoc, EntityResolutionDoc, WorkDoc } from "../db/schema";
import {
  apAuthorSchema,
  apEditionSchema,
  apWorkSchema,
  extractCoverUrl,
  extractReferenceId,
  extractReferenceName,
  type APAuthor,
  type APEdition,
  type APReference,
  type APWork
} from "../types/activitypub";
import { FetchQueue } from "./fetch-queue";

const ACCEPT_HEADER = "application/activity+json, application/ld+json, application/json";

class HttpResponseError extends Error {
  readonly retryable: boolean;

  constructor(readonly uri: string, readonly status: number) {
    super(`Failed to fetch ${uri}: ${status}`);
    this.retryable = status === 408 || status === 425 || status === 429 || status >= 500;
  }
}

export type ImportedEdition = {
  id: string;
  title: string;
  author?: string;
  coverUrl?: string;
  sourceUrl: string;
};

export class ActivityPubResolver {
  private readonly queue = new FetchQueue({
    concurrency: 4,
    perHostConcurrency: 2,
    retries: 2,
    timeoutMs: 8_000
  });

  async fetchJson(uri: string): Promise<unknown> {
    const normalizedUri = normalizeRemoteUri(uri);
    const url = new URL(normalizedUri);

    return this.queue.run(normalizedUri, async (signal) => {
      const response = await fetch(normalizedUri, {
        signal,
        headers: { Accept: ACCEPT_HEADER }
      });

      if (!response.ok) {
        throw new HttpResponseError(normalizedUri, response.status);
      }

      return response.json() as Promise<unknown>;
    }, {
      host: url.host,
      retries: 2,
      timeoutMs: 8_000
    });
  }

  async importEditionFromUrl(uri: string): Promise<ImportedEdition> {
    const normalizedUri = normalizeRemoteUri(uri);
    const edition = apEditionSchema.parse(await this.fetchJson(normalizedUri));
    const importedAt = new Date().toISOString();
    const authors = await this.resolveAuthors(edition.authors, importedAt);
    const work = await this.resolveWork(edition.work, authors, importedAt);
    const editionDoc = toEditionDoc(edition, normalizedUri, authors, work, importedAt);
    const resolutions = createResolutions(editionDoc, authors, work, importedAt);
    const db = await getDatabase();

    await Promise.all(authors.map((author) => db.authors.upsert(author)));
    if (work) {
      await db.works.upsert(work);
    }
    await db.editions.upsert(editionDoc);
    await Promise.all(resolutions.map((resolution) => db.entityresolutions.upsert(resolution)));

    return {
      id: editionDoc.id,
      title: editionDoc.title,
      author: authors.map((author) => author.name).join(", ") || undefined,
      coverUrl: editionDoc.coverUrl,
      sourceUrl: editionDoc.sourceUrl
    };
  }

  private async resolveAuthors(references: APReference[], importedAt: string): Promise<AuthorDoc[]> {
    const authors = await Promise.all(references.map(async (reference) => {
      const inlineName = extractReferenceName(reference);
      if (inlineName) {
        return toAuthorDoc({
          id: extractReferenceId(reference),
          name: inlineName,
          url: typeof reference === "string" ? undefined : reference.url
        }, importedAt);
      }

      const payload = apAuthorSchema.parse(await this.fetchJson(extractReferenceId(reference)));
      return toAuthorDoc(payload, importedAt);
    }));

    return dedupeById(authors);
  }

  private async resolveWork(reference: APEdition["work"], authors: AuthorDoc[], importedAt: string): Promise<WorkDoc | undefined> {
    if (!reference) return undefined;

    const inlineName = extractReferenceName(reference);
    if (inlineName) {
      return toWorkDoc({
        id: extractReferenceId(reference),
        title: inlineName,
        authors: authors.map((author) => author.apId)
      }, authors, importedAt);
    }

    const payload = apWorkSchema.parse(await this.fetchJson(extractReferenceId(reference)));
    return toWorkDoc(payload, authors, importedAt);
  }
}

function normalizeRemoteUri(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http and https ActivityPub URLs are supported");
  }

  assertAllowedHost(url.hostname);
  url.hash = "";
  return url.toString();
}

function assertAllowedHost(hostname: string): void {
  const normalizedHost = hostname.trim().toLowerCase();
  if (!normalizedHost) {
    throw new Error("URL is missing a host");
  }

  if (
    normalizedHost === "localhost" ||
    normalizedHost.endsWith(".local") ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost === "::1" ||
    normalizedHost.startsWith("10.") ||
    normalizedHost.startsWith("192.168.") ||
    normalizedHost.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalizedHost) ||
    normalizedHost.startsWith("fc") ||
    normalizedHost.startsWith("fd") ||
    normalizedHost.startsWith("fe80:")
  ) {
    throw new Error("Private or local network hosts are not allowed");
  }
}

function toAuthorDoc(payload: Pick<APAuthor, "id" | "name" | "preferredUsername" | "summary" | "url">, importedAt: string): AuthorDoc {
  return {
    id: payload.id,
    apId: payload.id,
    name: payload.name ?? payload.preferredUsername ?? payload.id,
    summary: payload.summary,
    url: payload.url,
    importedAt,
    updatedAt: importedAt
  };
}

function toWorkDoc(payload: Pick<APWork, "id" | "title" | "name" | "summary" | "url"> & { authors?: APWork["authors"] }, authors: AuthorDoc[], importedAt: string): WorkDoc {
  const authorIds = payload.authors?.length
    ? payload.authors.map((author) => extractReferenceId(author))
    : authors.map((author) => author.id);

  return {
    id: payload.id,
    apId: payload.id,
    title: payload.title ?? payload.name ?? payload.id,
    summary: payload.summary,
    url: payload.url,
    authorIds,
    importedAt,
    updatedAt: importedAt
  };
}

function toEditionDoc(payload: APEdition, sourceUrl: string, authors: AuthorDoc[], work: WorkDoc | undefined, importedAt: string): EditionDoc {
  return {
    id: payload.id,
    apId: payload.id,
    title: payload.title ?? payload.name ?? payload.id,
    subtitle: payload.subtitle,
    description: payload.description,
    authorIds: authors.map((author) => author.id),
    workId: work?.id,
    coverUrl: extractCoverUrl(payload.cover),
    isbn10: payload.isbn10,
    isbn13: payload.isbn13,
    sourceUrl,
    importedAt,
    updatedAt: importedAt
  };
}

function createResolutions(edition: EditionDoc, authors: AuthorDoc[], work: WorkDoc | undefined, importedAt: string): EntityResolutionDoc[] {
  const records: EntityResolutionDoc[] = [
    {
      id: `edition:${edition.apId}`,
      canonicalUri: edition.apId,
      entityType: "edition",
      entityId: edition.id,
      resolvedAt: importedAt
    }
  ];

  if (work) {
    records.push({
      id: `work:${work.apId}`,
      canonicalUri: work.apId,
      entityType: "work",
      entityId: work.id,
      resolvedAt: importedAt
    });
  }

  for (const author of authors) {
    records.push({
      id: `author:${author.apId}`,
      canonicalUri: author.apId,
      entityType: "author",
      entityId: author.id,
      resolvedAt: importedAt
    });
  }

  return records;
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}
