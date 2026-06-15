import { describe, it, expect, vi } from "vitest";
import { createEmbeddingScheduler } from "../embeddingScheduler";
import { createEmbeddingJobQueue } from "../embeddingJobQueue";
import type { EmbeddingJob, EmbeddingJobResult } from "../embeddingJobTypes";

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

describe("createEmbeddingScheduler", () => {
  it("executes a single queued job", async () => {
    const queue = createEmbeddingJobQueue();
    let receivedJob: EmbeddingJob | null = null;
    const execute = vi.fn(async (job: EmbeddingJob) => {
      receivedJob = job;
    });
    const scheduler = createEmbeddingScheduler({ queue, execute, concurrency: 1 });

    queue.enqueue(makeJob({ entityId: "a" }));
    await scheduler.drain();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(receivedJob).not.toBeNull();
    expect(receivedJob!.entityId).toBe("a");
    expect(queue.size()).toBe(0);
  });

  it("drains jobs in priority order", async () => {
    const queue = createEmbeddingJobQueue();
    const seen: string[] = [];
    const execute = vi.fn(async (job: EmbeddingJob) => {
      seen.push(job.entityId);
    });
    const scheduler = createEmbeddingScheduler({ queue, execute, concurrency: 1 });

    queue.enqueue(makeJob({ entityId: "backfill-1", priority: "backfill" }));
    queue.enqueue(makeJob({ entityId: "user-1", priority: "user-visible" }));
    queue.enqueue(makeJob({ entityId: "idle-1", priority: "idle" }));

    await scheduler.drain();

    expect(seen).toEqual(["user-1", "idle-1", "backfill-1"]);
  });

  it("retries failed jobs with backoff", async () => {
    const queue = createEmbeddingJobQueue();
    const execute = vi.fn().mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    const results: EmbeddingJobResult[] = [];
    let mockTime = 0;
    const scheduler = createEmbeddingScheduler({
      queue,
      execute,
      concurrency: 1,
      onResult: (r) => results.push(r),
      now: () => mockTime
    });

    queue.enqueue(makeJob({ entityId: "a", priority: "idle" }));
    await scheduler.drain();

    expect(results.length).toBe(1);
    expect(results[0].kind).toBe("retry-scheduled");
    expect(queue.size()).toBe(1);

    // Fast-forward past the retry delay
    mockTime = Date.now() + 60_000;
    const retryJob = queue.snapshot()[0];
    // Mark retry as ready
    if (retryJob.nextAttemptAt) {
      const updated = { ...retryJob, nextAttemptAt: new Date(0).toISOString() };
      queue.clear();
      queue.enqueue(updated);
    }

    await scheduler.drain();

    expect(execute).toHaveBeenCalledTimes(2);
    expect(results[1].kind).toBe("succeeded");
  });

  it("permanently fails after max attempts for user-visible jobs", async () => {
    const queue = createEmbeddingJobQueue();
    const execute = vi.fn().mockRejectedValue(new Error("permanent"));
    const results: EmbeddingJobResult[] = [];
    const scheduler = createEmbeddingScheduler({
      queue,
      execute,
      concurrency: 1,
      onResult: (r) => results.push(r)
    });

    // Pre-populate at attempt 2 (next failure brings it to 3 = max for user-visible)
    queue.enqueue(makeJob({ entityId: "a", priority: "user-visible", attempts: 2 }));
    await scheduler.drain();

    expect(results.length).toBe(1);
    expect(results[0].kind).toBe("permanently-failed");
    expect(queue.size()).toBe(0);
  });

  it("permanently fails after max attempts for backfill (5)", async () => {
    const queue = createEmbeddingJobQueue();
    const execute = vi.fn().mockRejectedValue(new Error("permanent"));
    const results: EmbeddingJobResult[] = [];
    const scheduler = createEmbeddingScheduler({
      queue,
      execute,
      concurrency: 1,
      onResult: (r) => results.push(r)
    });

    queue.enqueue(makeJob({ entityId: "a", priority: "backfill", attempts: 4 }));
    await scheduler.drain();

    expect(results[0].kind).toBe("permanently-failed");
  });

  it("respects concurrency limit", async () => {
    const queue = createEmbeddingJobQueue();
    let inFlightPeak = 0;
    let active = 0;
    const execute = vi.fn(async () => {
      active++;
      if (active > inFlightPeak) inFlightPeak = active;
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
    });
    const scheduler = createEmbeddingScheduler({ queue, execute, concurrency: 2 });

    for (let i = 0; i < 6; i++) {
      queue.enqueue(makeJob({ entityId: `j-${i}` }));
    }
    await scheduler.drain();

    expect(execute).toHaveBeenCalledTimes(6);
    expect(inFlightPeak).toBeLessThanOrEqual(2);
  });

  it("stops accepting new work after stop()", async () => {
    const queue = createEmbeddingJobQueue();
    const execute = vi.fn(async () => undefined);
    const scheduler = createEmbeddingScheduler({ queue, execute, concurrency: 1 });

    scheduler.stop();
    queue.enqueue(makeJob({ entityId: "a" }));
    await scheduler.drain();

    expect(execute).not.toHaveBeenCalled();
    expect(scheduler.isRunning()).toBe(false);
  });

  it("resumes after start()", async () => {
    const queue = createEmbeddingJobQueue();
    const execute = vi.fn(async () => undefined);
    const scheduler = createEmbeddingScheduler({ queue, execute, concurrency: 1 });

    scheduler.stop();
    scheduler.start();
    queue.enqueue(makeJob({ entityId: "a" }));
    await scheduler.drain();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(scheduler.isRunning()).toBe(true);
  });

  it("serializes overlapping drain calls so concurrency bound is respected", async () => {
    const queue = createEmbeddingJobQueue();
    let inFlightPeak = 0;
    let active = 0;
    const execute = vi.fn(async () => {
      active++;
      if (active > inFlightPeak) inFlightPeak = active;
      await new Promise((resolve) => setTimeout(resolve, 20));
      active--;
    });
    const scheduler = createEmbeddingScheduler({ queue, execute, concurrency: 2 });

    for (let i = 0; i < 8; i++) {
      queue.enqueue(makeJob({ entityId: `j-${i}` }));
    }

    // Trigger four overlapping drain calls; they should all share the same cycle.
    const drains = [
      scheduler.drain(),
      scheduler.drain(),
      scheduler.drain(),
      scheduler.drain()
    ];
    await Promise.all(drains);

    expect(execute).toHaveBeenCalledTimes(8);
    // The advertised concurrency bound must hold despite multiple drain callers.
    expect(inFlightPeak).toBeLessThanOrEqual(2);
  });

  it("does not crash if onResult throws", async () => {
    const queue = createEmbeddingJobQueue();
    const execute = vi.fn(async () => undefined);
    const scheduler = createEmbeddingScheduler({
      queue,
      execute,
      concurrency: 1,
      onResult: () => {
        throw new Error("listener exploded");
      }
    });

    queue.enqueue(makeJob({ entityId: "a" }));
    queue.enqueue(makeJob({ entityId: "b" }));
    await expect(scheduler.drain()).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("emits stale-dropped when a retry evicts a queued job", async () => {
    const queue = createEmbeddingJobQueue({ maxSize: 1 });
    const results: EmbeddingJobResult[] = [];

    let attempts = 0;
    const execute = vi.fn(async () => {
      attempts++;
      // First execution fails (the one taken from the queue), forcing a retry.
      if (attempts === 1) {
        // While we're "executing", simulate another job arriving in the now-empty queue.
        queue.enqueue(makeJob({ entityId: "newcomer", priority: "backfill" }));
        throw new Error("transient");
      }
    });

    const scheduler = createEmbeddingScheduler({
      queue,
      execute,
      concurrency: 1,
      onResult: (r) => results.push(r)
    });

    // The original job has higher priority than the newcomer, so its retry
    // re-enqueue should evict the newcomer.
    queue.enqueue(makeJob({ entityId: "uv", priority: "user-visible" }));
    await scheduler.drain();

    const staleDropped = results.find((r) => r.kind === "stale-dropped");
    expect(staleDropped).toBeDefined();
    if (staleDropped && staleDropped.kind === "stale-dropped") {
      expect(staleDropped.job.entityId).toBe("newcomer");
    }
  });
});
