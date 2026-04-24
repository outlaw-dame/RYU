import { ingestActivityPubGraph, type ActivityPubEntityStore } from "../db/activitypub-ingest";
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

  constructor(private readonly store?: ActivityPubEntityStore) {}

  async fetchGraph(uri: string): Promise<CanonicalApGraph> {
    return this.client.fetchGraph(uri);
  }

  async importEditionFromUrl(uri: string, store = this.store): Promise<ImportedEdition> {
    if (!store) {
      throw new Error("ActivityPub import requires an entity store");
    }

    const graph = await this.client.fetchGraph(uri);
    const edition = graph.entities.find((entity): entity is Extract<CanonicalApEntity, { kind: "edition" }> => {
      return entity.kind === "edition" && entity.id === graph.rootId;
    });

    if (!edition) {
      throw new Error("ActivityPub URL did not resolve to an Edition");
    }

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
