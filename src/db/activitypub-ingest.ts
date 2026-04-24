import type { CanonicalApEntity, CanonicalApGraph } from "../sync/activitypub-client";

export type ActivityPubEntityStore = {
  upsertAuthor(entity: Extract<CanonicalApEntity, { kind: "author" }>): Promise<void>;
  upsertWork(entity: Extract<CanonicalApEntity, { kind: "work" }>): Promise<void>;
  upsertEdition(entity: Extract<CanonicalApEntity, { kind: "edition" }>): Promise<void>;
  upsertReview(entity: Extract<CanonicalApEntity, { kind: "review" }>): Promise<void>;
};

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
  } satisfies Record<CanonicalApEntity["kind"], number>;

  return [...entities].sort((left, right) => rank[left.kind] - rank[right.kind]);
}
