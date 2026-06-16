import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SearchDocument } from "../../types";
import type { EmbeddingJob } from "../embeddingJobTypes";

vi.mock("../../embedding-provider", () => ({
  getEmbeddingProvider: vi.fn()
}));

vi.mock("../../vector-index", () => ({
  indexDocument: vi.fn()
}));

vi.mock("../../embeddings", () => ({
  searchableText: vi.fn((doc: any) => `${doc.title} ${doc.authorText}`)
}));

vi.mock("../../vector-utils", () => ({
  hashText: vi.fn((text: string) => `hash:${text.slice(0, 10)}`)
}));

import { getEmbeddingProvider } from "../../embedding-provider";
import { indexDocument } from "../../vector-index";
import { createScheduledRepairIndexer, createEmbeddingJobExecutor } from "../scheduledIndexer";
import { createEmbeddingJobQueue } from "../embeddingJobQueue";
import { createEmbeddingScheduler } from "../embeddingScheduler";

const mockGetProvider = vi.mocked(getEmbeddingProvider);
const mockIndexDocument = vi.mocked(indexDocument);

function makeDoc(id: string, title: string): SearchDocument {
  return {
    id,
    type: "work",
    title,
    description: "",
    authorText: "Author",
    isbnText: "",
    enrichmentText: "",
    source: "local",
    updatedAt: "2026-01-01T00:00:00Z"
  };
}

describe("createScheduledRepairIndexer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inlines deterministic provider calls without enqueuing", async () => {
    mockGetProvider.mockReturnValue({
      id: "deterministic-v1",
      dimensions: 128,
      embed: vi.fn(() => Array(128).fill(0))
    });

    const queue = createEmbeddingJobQueue();
    const scheduler = createEmbeddingScheduler({
      queue,
      execute: vi.fn(),
      concurrency: 1
    });

    const { indexer } = createScheduledRepairIndexer(queue, scheduler);
    await indexer(makeDoc("w1", "Dune"), {} as any);

    expect(mockIndexDocument).toHaveBeenCalledTimes(1);
    expect(queue.size()).toBe(0);
  });

  it("enqueues MiniLM provider work through the scheduler instead of calling indexDocument", async () => {
    mockGetProvider.mockReturnValue({
      id: "minilm-v2",
      dimensions: 384,
      embed: vi.fn()
    });

    const queue = createEmbeddingJobQueue();
    const scheduler = createEmbeddingScheduler({
      queue,
      execute: vi.fn(),
      concurrency: 1
    });

    const { indexer } = createScheduledRepairIndexer(queue, scheduler);
    await indexer(makeDoc("w1", "Dune"), {} as any);

    // indexDocument was NOT called directly — it's enqueued for the scheduler.
    expect(mockIndexDocument).not.toHaveBeenCalled();
    expect(queue.size()).toBe(1);

    const snapshot = queue.snapshot();
    expect(snapshot[0].entityId).toBe("w1");
    expect(snapshot[0].priority).toBe("repair");
    expect(snapshot[0].providerId).toBe("minilm-v2");
  });

  it("uses the specified priority class", async () => {
    mockGetProvider.mockReturnValue({
      id: "embeddinggemma-v1",
      dimensions: 768,
      embed: vi.fn()
    });

    const queue = createEmbeddingJobQueue();
    const scheduler = createEmbeddingScheduler({
      queue,
      execute: vi.fn(),
      concurrency: 1
    });

    const { indexer } = createScheduledRepairIndexer(queue, scheduler, { priority: "backfill" });
    await indexer(makeDoc("w1", "Foundation"), {} as any);

    expect(queue.snapshot()[0].priority).toBe("backfill");
  });

  it("deduplicates jobs for the same entity/provider/textHash", async () => {
    mockGetProvider.mockReturnValue({
      id: "minilm-v2",
      dimensions: 384,
      embed: vi.fn()
    });

    const queue = createEmbeddingJobQueue();
    const scheduler = createEmbeddingScheduler({
      queue,
      execute: vi.fn(),
      concurrency: 1
    });

    const { indexer } = createScheduledRepairIndexer(queue, scheduler);
    const doc = makeDoc("w1", "Dune");
    await indexer(doc, {} as any);
    await indexer(doc, {} as any);

    // Same document = same dedup key = not re-enqueued.
    expect(queue.size()).toBe(1);
  });
});

describe("createEmbeddingJobExecutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the document and calls indexDocument", async () => {
    mockGetProvider.mockReturnValue({
      id: "minilm-v2",
      dimensions: 384,
      embed: vi.fn(() => Array(384).fill(0))
    });

    const doc = makeDoc("w1", "Dune");
    const getDocument = vi.fn(async () => doc);
    const executor = createEmbeddingJobExecutor({} as any, getDocument);

    const job: EmbeddingJob = {
      id: "test-job",
      entityId: "w1",
      entityType: "work",
      textHash: "hash:Dune Autho",
      providerId: "minilm-v2",
      dimensions: 384,
      priority: "repair",
      attempts: 0,
      enqueuedAt: new Date().toISOString()
    };

    await executor(job);

    expect(getDocument).toHaveBeenCalledWith("w1", "work");
    expect(mockIndexDocument).toHaveBeenCalledWith(doc, expect.anything());
  });

  it("skips silently when document no longer exists (orphan)", async () => {
    mockGetProvider.mockReturnValue({
      id: "minilm-v2",
      dimensions: 384,
      embed: vi.fn()
    });

    const getDocument = vi.fn(async () => null);
    const executor = createEmbeddingJobExecutor({} as any, getDocument);

    const job: EmbeddingJob = {
      id: "test-job",
      entityId: "orphan-1",
      entityType: "edition",
      textHash: "hash:whatever",
      providerId: "minilm-v2",
      dimensions: 384,
      priority: "repair",
      attempts: 0,
      enqueuedAt: new Date().toISOString()
    };

    await executor(job);

    expect(mockIndexDocument).not.toHaveBeenCalled();
  });

  it("skips silently when the job provider does not match the active provider", async () => {
    mockGetProvider.mockReturnValue({
      id: "different-provider",
      dimensions: 768,
      embed: vi.fn()
    });

    const getDocument = vi.fn();
    const executor = createEmbeddingJobExecutor({} as any, getDocument);

    const job: EmbeddingJob = {
      id: "test-job",
      entityId: "w1",
      entityType: "work",
      textHash: "hash:whatever",
      providerId: "minilm-v2",
      dimensions: 384,
      priority: "repair",
      attempts: 0,
      enqueuedAt: new Date().toISOString()
    };

    await executor(job);

    // getDocument should not even be called if provider is stale
    expect(getDocument).not.toHaveBeenCalled();
    expect(mockIndexDocument).not.toHaveBeenCalled();
  });

  it("flush() drains enqueued jobs through the scheduler", async () => {
    mockGetProvider.mockReturnValue({
      id: "minilm-v2",
      dimensions: 384,
      embed: vi.fn()
    });

    const queue = createEmbeddingJobQueue();
    const executeFn = vi.fn(async () => undefined);
    const scheduler = createEmbeddingScheduler({
      queue,
      execute: executeFn,
      concurrency: 1
    });

    const { indexer, flush } = createScheduledRepairIndexer(queue, scheduler);

    // Enqueue two docs
    await indexer(makeDoc("w1", "Dune"), {} as any);
    await indexer(makeDoc("w2", "Foundation"), {} as any);

    expect(queue.size()).toBe(2);
    expect(executeFn).not.toHaveBeenCalled();

    // flush drains the queue
    await flush();

    expect(executeFn).toHaveBeenCalledTimes(2);
    expect(queue.size()).toBe(0);
  });
});
