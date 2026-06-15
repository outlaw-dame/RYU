import { describe, it, expect } from "vitest";
import { createEmbeddingJobQueue } from "../embeddingJobQueue";
import { embeddingJobKey, type EmbeddingJob, type EmbeddingJobPriority } from "../embeddingJobTypes";

function makeJob(overrides: Partial<EmbeddingJob> & { entityId: string }): EmbeddingJob {
  return {
    id: overrides.entityId,
    entityId: overrides.entityId,
    entityType: overrides.entityType ?? "work",
    textHash: overrides.textHash ?? "hash-1",
    providerId: overrides.providerId ?? "deterministic-v1",
    dimensions: overrides.dimensions ?? 128,
    priority: overrides.priority ?? "idle",
    attempts: overrides.attempts ?? 0,
    enqueuedAt: overrides.enqueuedAt ?? new Date(2026, 0, 1).toISOString(),
    nextAttemptAt: overrides.nextAttemptAt
  };
}

describe("EmbeddingJobQueue", () => {
  describe("enqueue", () => {
    it("adds a new job", () => {
      const queue = createEmbeddingJobQueue();
      const result = queue.enqueue(makeJob({ entityId: "a" }));

      expect(result.added).toBe(true);
      expect(queue.size()).toBe(1);
    });

    it("deduplicates jobs with same entity, provider, and textHash", () => {
      const queue = createEmbeddingJobQueue();
      queue.enqueue(makeJob({ entityId: "a", priority: "idle" }));
      const second = queue.enqueue(makeJob({ entityId: "a", priority: "idle" }));

      expect(second.added).toBe(false);
      expect(queue.size()).toBe(1);
    });

    it("keeps higher-priority duplicate when re-enqueued", () => {
      const queue = createEmbeddingJobQueue();
      queue.enqueue(makeJob({ entityId: "a", priority: "idle" }));
      const upgrade = queue.enqueue(makeJob({ entityId: "a", priority: "user-visible" }));

      expect(upgrade.added).toBe(true);
      expect(upgrade.replaced?.priority).toBe("idle");
      expect(queue.size()).toBe(1);
      expect(queue.snapshot()[0].priority).toBe("user-visible");
    });

    it("does not downgrade priority on duplicate enqueue", () => {
      const queue = createEmbeddingJobQueue();
      queue.enqueue(makeJob({ entityId: "a", priority: "user-visible" }));
      queue.enqueue(makeJob({ entityId: "a", priority: "idle" }));

      expect(queue.snapshot()[0].priority).toBe("user-visible");
    });

    it("evicts lowest-priority oldest job at capacity", () => {
      const queue = createEmbeddingJobQueue({ maxSize: 2 });
      queue.enqueue(makeJob({ entityId: "old-backfill", priority: "backfill", enqueuedAt: new Date(2026, 0, 1).toISOString() }));
      queue.enqueue(makeJob({ entityId: "new-backfill", priority: "backfill", enqueuedAt: new Date(2026, 0, 2).toISOString() }));

      const result = queue.enqueue(makeJob({
        entityId: "user",
        priority: "user-visible",
        enqueuedAt: new Date(2026, 0, 3).toISOString()
      }));

      expect(result.added).toBe(true);
      expect(result.evicted?.entityId).toBe("old-backfill");
      expect(queue.size()).toBe(2);
    });

    it("treats different providers as distinct slots", () => {
      const queue = createEmbeddingJobQueue();
      queue.enqueue(makeJob({ entityId: "a", providerId: "deterministic-v1" }));
      queue.enqueue(makeJob({ entityId: "a", providerId: "minilm" }));

      expect(queue.size()).toBe(2);
    });

    it("treats different textHashes as distinct slots", () => {
      const queue = createEmbeddingJobQueue();
      queue.enqueue(makeJob({ entityId: "a", textHash: "h1" }));
      queue.enqueue(makeJob({ entityId: "a", textHash: "h2" }));

      expect(queue.size()).toBe(2);
    });
  });

  describe("takeNext", () => {
    it("returns null when empty", () => {
      const queue = createEmbeddingJobQueue();
      expect(queue.takeNext()).toBeNull();
    });

    it("returns user-visible jobs before idle", () => {
      const queue = createEmbeddingJobQueue();
      queue.enqueue(makeJob({ entityId: "a", priority: "idle" }));
      queue.enqueue(makeJob({ entityId: "b", priority: "user-visible" }));

      const next = queue.takeNext();
      expect(next?.priority).toBe("user-visible");
      expect(next?.entityId).toBe("b");
    });

    it("returns repair jobs before backfill", () => {
      const queue = createEmbeddingJobQueue();
      queue.enqueue(makeJob({ entityId: "a", priority: "backfill" }));
      queue.enqueue(makeJob({ entityId: "b", priority: "repair" }));

      expect(queue.takeNext()?.priority).toBe("repair");
    });

    it("returns FIFO within same priority", () => {
      const queue = createEmbeddingJobQueue();
      queue.enqueue(makeJob({ entityId: "older", priority: "idle", enqueuedAt: new Date(2026, 0, 1).toISOString() }));
      queue.enqueue(makeJob({ entityId: "newer", priority: "idle", enqueuedAt: new Date(2026, 0, 2).toISOString() }));

      expect(queue.takeNext()?.entityId).toBe("older");
    });

    it("skips jobs whose nextAttemptAt is in the future", () => {
      const queue = createEmbeddingJobQueue();
      const future = new Date(2030, 0, 1).getTime();
      queue.enqueue(makeJob({
        entityId: "delayed",
        priority: "user-visible",
        nextAttemptAt: new Date(future).toISOString()
      }));
      queue.enqueue(makeJob({
        entityId: "ready",
        priority: "idle"
      }));

      const next = queue.takeNext(Date.now());
      expect(next?.entityId).toBe("ready");
    });

    it("picks up delayed jobs once their nextAttemptAt has passed", () => {
      const queue = createEmbeddingJobQueue();
      const past = new Date(2020, 0, 1).toISOString();
      queue.enqueue(makeJob({
        entityId: "ready-now",
        priority: "user-visible",
        nextAttemptAt: past
      }));

      expect(queue.takeNext()?.entityId).toBe("ready-now");
    });

    it("removes the job from the queue after taking it", () => {
      const queue = createEmbeddingJobQueue();
      queue.enqueue(makeJob({ entityId: "a" }));
      queue.takeNext();
      expect(queue.size()).toBe(0);
    });
  });

  describe("remove", () => {
    it("removes a queued job by key", () => {
      const queue = createEmbeddingJobQueue();
      const job = makeJob({ entityId: "a" });
      queue.enqueue(job);
      const key = embeddingJobKey(job.entityId, job.providerId, job.textHash);

      const removed = queue.remove(key);
      expect(removed?.entityId).toBe("a");
      expect(queue.size()).toBe(0);
    });

    it("returns null when key is unknown", () => {
      const queue = createEmbeddingJobQueue();
      expect(queue.remove("missing")).toBeNull();
    });
  });

  describe("clear", () => {
    it("empties the queue", () => {
      const queue = createEmbeddingJobQueue();
      queue.enqueue(makeJob({ entityId: "a" }));
      queue.enqueue(makeJob({ entityId: "b" }));

      queue.clear();
      expect(queue.size()).toBe(0);
    });
  });

  describe("snapshot", () => {
    it("returns all queued jobs", () => {
      const queue = createEmbeddingJobQueue();
      queue.enqueue(makeJob({ entityId: "a" }));
      queue.enqueue(makeJob({ entityId: "b" }));

      const snapshot = queue.snapshot();
      expect(snapshot.length).toBe(2);
    });
  });
});
