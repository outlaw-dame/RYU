import type { KnowledgeEntityCandidate } from './entity-enrichment';
import { enrichKnowledgeEntity } from './entity-enrichment';

export type KnowledgeEnricher = (candidate: KnowledgeEntityCandidate) => Promise<void> | void;

export type EntityEnrichmentSchedulerOptions = {
  concurrency?: number;
  maxSize?: number;
  enrich?: KnowledgeEnricher;
  logger?: Pick<Console, 'error' | 'warn'>;
};

export type EntityEnrichmentScheduler = {
  enqueue(candidate: KnowledgeEntityCandidate): void;
  pending(): number;
  active(): number;
  idle(): Promise<void>;
};

const DEFAULT_CONCURRENCY = 1;
const DEFAULT_MAX_SIZE = 250;

function jobKey(candidate: KnowledgeEntityCandidate): string {
  return `${candidate.kind}:${candidate.id}`;
}

export function createEntityEnrichmentScheduler(options: EntityEnrichmentSchedulerOptions = {}): EntityEnrichmentScheduler {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  const enrich = options.enrich ?? enrichKnowledgeEntity;
  const logger = options.logger ?? console;
  const queue: KnowledgeEntityCandidate[] = [];
  const idleResolvers: Array<() => void> = [];
  let activeJobs = 0;

  function flushIdleResolvers(): void {
    if (queue.length > 0 || activeJobs > 0) return;
    const resolvers = idleResolvers.splice(0, idleResolvers.length);
    for (const resolve of resolvers) resolve();
  }

  async function run(candidate: KnowledgeEntityCandidate): Promise<void> {
    try {
      await enrich(candidate);
    } catch (error) {
      logger.error('Knowledge enrichment failed', {
        entityId: candidate.id,
        entityKind: candidate.kind,
        error
      });
    }
  }

  function drain(): void {
    while (activeJobs < concurrency && queue.length > 0) {
      const candidate = queue.shift();
      if (!candidate) continue;
      activeJobs += 1;
      void run(candidate).finally(() => {
        activeJobs -= 1;
        drain();
      });
    }

    flushIdleResolvers();
  }

  function enqueue(candidate: KnowledgeEntityCandidate): void {
    const key = jobKey(candidate);
    const existingIndex = queue.findIndex((queued) => jobKey(queued) === key);

    if (existingIndex >= 0) {
      queue.splice(existingIndex, 1);
    } else if (queue.length >= maxSize) {
      const dropped = queue.shift();
      if (dropped) {
        logger.warn('Knowledge enrichment queue reached capacity; dropping oldest pending job', {
          entityId: dropped.id,
          entityKind: dropped.kind
        });
      }
    }

    queue.push(candidate);
    drain();
  }

  function idle(): Promise<void> {
    if (queue.length === 0 && activeJobs === 0) return Promise.resolve();
    return new Promise((resolve) => idleResolvers.push(resolve));
  }

  return {
    enqueue,
    pending: () => queue.length,
    active: () => activeJobs,
    idle
  };
}

export const defaultEntityEnrichmentScheduler = createEntityEnrichmentScheduler();
