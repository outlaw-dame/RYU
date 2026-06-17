import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _CHECKPOINT_STALE_AFTER_MS,
  _CHECKPOINT_STORAGE_KEY,
  checkpointEmbeddingQueue,
  restoreEmbeddingQueue
} from "../queueCheckpoint";
import { createEmbeddingJobQueue } from "../../embedding-jobs/embeddingJobQueue";
import type { EmbeddingJob } from "../../embedding-jobs/embeddingJobTypes";

function makeJob(overrides: Partial<EmbeddingJob> = {}): EmbeddingJob {
  return {
    id: "id-1",
    entityId: "entity-1",
    entityType: "work",
    textHash: "hash-1",
    providerId: "minilm-l6-v2-q8-with-deterministic-fallback",
    dimensions: 384,
    priority: "backfill",
    attempts: 0,
    enqueuedAt: new Date().toISOString(),
    ...overrides
  };
}

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("checkpointEmbeddingQueue", () => {
  it("persists backfill/idle/repair jobs and excludes user-visible jobs", () => {
    const queue = createEmbeddingJobQueue();
    queue.enqueue(makeJob({ id: "uv", entityId: "uv", priority: "user-visible" }));
    queue.enqueue(makeJob({ id: "idle", entityId: "idle", priority: "idle" }));
    queue.enqueue(makeJob({ id: "back", entityId: "back", priority: "backfill" }));

    expect(checkpointEmbeddingQueue(queue)).toBe(true);
    const raw = localStorage.getItem(_CHECKPOINT_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.version).toBe(1);
    const ids = parsed.jobs.map((j: EmbeddingJob) => j.entityId).sort();
    expect(ids).toEqual(["back", "idle"]);
  });

  it("clears the checkpoint when the queue has no persistable jobs", () => {
    localStorage.setItem(
      _CHECKPOINT_STORAGE_KEY,
      JSON.stringify({ version: 1, savedAt: Date.now(), jobs: [makeJob()] })
    );
    const queue = createEmbeddingJobQueue();
    queue.enqueue(makeJob({ priority: "user-visible" }));
    checkpointEmbeddingQueue(queue);
    expect(localStorage.getItem(_CHECKPOINT_STORAGE_KEY)).toBeNull();
  });

  it("returns false (and does not throw) when storage rejects setItem", () => {
    const failing: Storage = {
      length: 0,
      clear() {},
      getItem: () => null,
      key: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error("quota exceeded");
      }
    };
    vi.stubGlobal("localStorage", failing);

    const queue = createEmbeddingJobQueue();
    queue.enqueue(makeJob());
    expect(checkpointEmbeddingQueue(queue)).toBe(false);
  });
});

describe("restoreEmbeddingQueue", () => {
  it("returns 0/0 when no checkpoint is present", () => {
    const queue = createEmbeddingJobQueue();
    expect(restoreEmbeddingQueue(queue)).toEqual({ restored: 0, dropped: 0 });
  });

  it("restores valid jobs and clears the checkpoint", () => {
    const job = makeJob({ entityId: "rehydrated", attempts: 5 });
    localStorage.setItem(
      _CHECKPOINT_STORAGE_KEY,
      JSON.stringify({ version: 1, savedAt: Date.now(), jobs: [job] })
    );
    const queue = createEmbeddingJobQueue();
    const result = restoreEmbeddingQueue(queue);
    expect(result.restored).toBe(1);
    expect(queue.size()).toBe(1);
    // attempts must reset so the retry budget is fresh.
    const restored = queue.snapshot()[0];
    expect(restored.attempts).toBe(0);
    expect(restored.entityId).toBe("rehydrated");
    // Checkpoint cleared so a save→restore→save cycle does not duplicate.
    expect(localStorage.getItem(_CHECKPOINT_STORAGE_KEY)).toBeNull();
  });

  it("drops checkpoints with the wrong version", () => {
    localStorage.setItem(
      _CHECKPOINT_STORAGE_KEY,
      JSON.stringify({ version: 99, savedAt: Date.now(), jobs: [makeJob()] })
    );
    const queue = createEmbeddingJobQueue();
    expect(restoreEmbeddingQueue(queue).restored).toBe(0);
    expect(queue.size()).toBe(0);
  });

  it("drops stale checkpoints older than 24h and clears storage", () => {
    const stale = Date.now() - _CHECKPOINT_STALE_AFTER_MS - 1;
    localStorage.setItem(
      _CHECKPOINT_STORAGE_KEY,
      JSON.stringify({ version: 1, savedAt: stale, jobs: [makeJob(), makeJob({ id: "j2" })] })
    );
    const queue = createEmbeddingJobQueue();
    const result = restoreEmbeddingQueue(queue);
    expect(result.restored).toBe(0);
    expect(result.dropped).toBe(2);
    expect(localStorage.getItem(_CHECKPOINT_STORAGE_KEY)).toBeNull();
  });

  it("ignores corrupted JSON and clears storage", () => {
    localStorage.setItem(_CHECKPOINT_STORAGE_KEY, "{not-json");
    const queue = createEmbeddingJobQueue();
    const result = restoreEmbeddingQueue(queue);
    expect(result).toEqual({ restored: 0, dropped: 0 });
    expect(localStorage.getItem(_CHECKPOINT_STORAGE_KEY)).toBeNull();
  });

  it("drops malformed individual jobs without throwing", () => {
    localStorage.setItem(
      _CHECKPOINT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        jobs: [
          makeJob({ id: "good" }),
          { entityId: "bad" },
          null,
          "not-an-object"
        ]
      })
    );
    const queue = createEmbeddingJobQueue();
    const result = restoreEmbeddingQueue(queue);
    expect(result.restored).toBe(1);
    expect(result.dropped).toBe(3);
  });
});
