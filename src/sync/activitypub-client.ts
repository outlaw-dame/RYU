import { z } from "zod";
import {
  apAuthorSchema,
  apEditionSchema,
  apReviewSchema,
  apWorkSchema,
  extractCoverUrl,
  extractReferenceId,
  type APReference
} from "../types/activitypub";
import { FetchQueue } from "./fetch-queue";
import { normalizeRemoteHttpUrl } from "./safe-url";

const ACCEPT_HEADER = "application/activity+json, application/ld+json, application/json";
const jsonContentTypes = ["application/activity+json", "application/ld+json", "application/json"];

export type CanonicalApEntity =
  | {
      kind: "author";
      id: string;
      name: string;
      summary?: string;
      url?: string;
    }
  | {
      kind: "work";
      id: string;
      title: string;
      summary?: string;
      authorIds: string[];
      url?: string;
    }
  | {
      kind: "edition";
      id: string;
      title: string;
      subtitle?: string;
      description?: string;
      authorIds: string[];
      workId?: string;
      coverUrl?: string;
      isbn10?: string;
      isbn13?: string;
      sourceUrl: string;
    }
  | {
      kind: "review";
      id: string;
      title?: string;
      content: string;
      editionId: string;
      accountId: string;
      rating?: number;
      published: string;
    };

export class ActivityPubResponseError extends Error {
  readonly retryable: boolean;

  constructor(readonly url: string, readonly status: number) {
    super(`Failed to fetch ActivityPub object ${url}: ${status}`);
    this.retryable = status === 408 || status === 425 || status === 429 || status >= 500;
  }
}

export class ActivityPubClient {
  private readonly queue = new FetchQueue({
    concurrency: 4,
    perHostConcurrency: 2,
    retries: 2,
    timeoutMs: 8_000
  });

  async fetchEntity(input: string): Promise<CanonicalApEntity> {
    const url = normalizeRemoteHttpUrl(input);
    const payload = await this.queue.run(url.toString(), (signal) => this.fetchJson(url, signal), {
      host: url.host
    });

    return normalizeApObject(payload, url.toString());
  }

  private async fetchJson(url: URL, signal: AbortSignal): Promise<unknown> {
    const response = await fetch(url, {
      signal,
      headers: { Accept: ACCEPT_HEADER }
    });

    if (!response.ok) {
      throw new ActivityPubResponseError(url.toString(), response.status);
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!jsonContentTypes.some((type) => contentType.includes(type))) {
      throw new Error(`Invalid ActivityPub response content type: ${contentType || "unknown"}`);
    }

    return response.json() as Promise<unknown>;
  }
}

export function normalizeApObject(payload: unknown, sourceUrl: string): CanonicalApEntity {
  const type = z.object({ type: z.string() }).parse(payload).type;
  const parsed = parseTypedObject(type, payload);
  const id = canonicalId(parsed.id);

  switch (parsed.type) {
    case "Author":
    case "Person":
      return {
        kind: "author",
        id,
        name: parsed.name ?? parsed.preferredUsername ?? id,
        summary: parsed.summary,
        url: parsed.url
      };
    case "Work":
    case "Book":
      return {
        kind: "work",
        id,
        title: parsed.title ?? parsed.name ?? id,
        summary: parsed.summary,
        authorIds: parsed.authors.map(canonicalReferenceId),
        url: parsed.url
      };
    case "Edition":
      return {
        kind: "edition",
        id,
        title: parsed.title ?? parsed.name ?? id,
        subtitle: parsed.subtitle,
        description: parsed.description,
        authorIds: parsed.authors.map(canonicalReferenceId),
        workId: parsed.work ? canonicalReferenceId(parsed.work) : undefined,
        coverUrl: extractCoverUrl(parsed.cover),
        isbn10: parsed.isbn10,
        isbn13: parsed.isbn13,
        sourceUrl
      };
    case "Review":
      return {
        kind: "review",
        id,
        title: parsed.name,
        content: parsed.content,
        editionId: canonicalId(parsed.inReplyToBook),
        accountId: canonicalId(parsed.attributedTo),
        rating: parsed.rating,
        published: parsed.published
      };
  }
}

function parseTypedObject(type: string, payload: unknown) {
  switch (type) {
    case "Author":
    case "Person":
      return apAuthorSchema.parse(payload);
    case "Work":
    case "Book":
      return apWorkSchema.parse(payload);
    case "Edition":
      return apEditionSchema.parse(payload);
    case "Review":
      return apReviewSchema.parse(payload);
    default:
      throw new Error(`Unsupported ActivityPub object type: ${type}`);
  }
}

function canonicalReferenceId(reference: APReference): string {
  return canonicalId(extractReferenceId(reference));
}

function canonicalId(input: string): string {
  return normalizeRemoteHttpUrl(input).toString();
}
