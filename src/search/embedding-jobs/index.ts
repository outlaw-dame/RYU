/**
 * Public API for the embedding job scheduler.
 */

export type {
  EmbeddingJob,
  EmbeddingJobPriority,
  EmbeddingJobResult
} from "./embeddingJobTypes";

export {
  MAX_ATTEMPTS_BY_PRIORITY,
  embeddingJobKey,
  nextRetryDelayMs
} from "./embeddingJobTypes";

export type {
  EmbeddingJobQueue,
  EmbeddingJobQueueOptions
} from "./embeddingJobQueue";

export { createEmbeddingJobQueue } from "./embeddingJobQueue";

export type {
  EmbeddingJobExecutor,
  EmbeddingScheduler,
  EmbeddingSchedulerOptions
} from "./embeddingScheduler";

export { createEmbeddingScheduler } from "./embeddingScheduler";
