import { describe, expect, it } from "vitest";
import type { RyuDatabase } from "./client";
import { createRxDBActivityPubStore } from "./activitypub-ingest";
import type { SearchIndexQueue } from "../search/write-through-indexing";
import type { CanonicalApEntity } from "../sync/activitypub-client";

const review: Extract<CanonicalApEntity, { kind: "review" }> = {
  kind: "review",
  id: "https://books.example/reviews/1",
  content: "Excellent.",
  editionId: "https://books.example/books/1",
  accountId: "https://books.example/users/alice",
  published: "2026-07-25T00:00:00.000Z"
};

function createHarness() {
  let persistedReview: Record<string, unknown> | null = null;
  const db = {
    reviews: {
      upsert: async (doc: Record<string, unknown>) => {
        persistedReview = doc;
      }
    },
    entityresolutions: {
      upsert: async () => undefined
    }
  } as unknown as RyuDatabase;
  const searchIndexQueue: SearchIndexQueue = {
    enqueue: () => undefined,
    pending: () => 0,
    active: () => 0,
    idle: async () => undefined
  };

  return {
    db,
    searchIndexQueue,
    persisted: () => persistedReview
  };
}

describe("ActivityPub review attribution", () => {
  it("does not treat unauthenticated attributedTo as verified", async () => {
    const harness = createHarness();
    const store = createRxDBActivityPubStore(harness.db, {
      searchIndexQueue: harness.searchIndexQueue
    });

    await store.upsertReview(review);

    expect(harness.persisted()).toMatchObject({
      accountId: review.accountId
    });
    expect(harness.persisted()).not.toHaveProperty("reviewerAccountId");
    expect(harness.persisted()).not.toHaveProperty("reviewerAttributionSource");
  });

  it("persists attribution only when authenticated actor control matches attributedTo", async () => {
    const harness = createHarness();
    const store = createRxDBActivityPubStore(harness.db, {
      searchIndexQueue: harness.searchIndexQueue,
      authenticatedReviewerResolver: () => "https://books.example/users/alice"
    });

    await store.upsertReview(review);

    expect(harness.persisted()).toMatchObject({
      reviewerAccountId: "https://books.example/users/alice",
      reviewerAttributionSource: "authenticated_activitypub_actor"
    });
  });

  it("rejects authenticated provenance for a different actor", async () => {
    const harness = createHarness();
    const store = createRxDBActivityPubStore(harness.db, {
      searchIndexQueue: harness.searchIndexQueue,
      authenticatedReviewerResolver: () => "https://books.example/users/mallory"
    });

    await expect(store.upsertReview(review)).rejects.toThrow(
      "Authenticated reviewer identity does not match attributed actor"
    );
    expect(harness.persisted()).toBeNull();
  });
});
