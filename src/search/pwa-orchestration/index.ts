/**
 * Phase 15 — PWA orchestration public API.
 */

export {
  type LifecycleNetwork,
  type LifecyclePhase,
  type LifecycleReadiness,
  type LifecycleSnapshot,
  type LifecycleVisibility,
  getLifecycleSnapshot,
  probeLifecycle,
  startLifecycleSignals,
  stopLifecycleSignals,
  subscribeLifecycle
} from "./lifecycleSignals";

export {
  type PressureSnapshot,
  probePressureSignals,
  shouldPauseBackgroundWork
} from "./pressureSignals";

export {
  type CreateCoordinatorOptions,
  createMultiTabCoordinator
} from "./multiTabCoordination";

export {
  checkpointEmbeddingQueue,
  restoreEmbeddingQueue
} from "./queueCheckpoint";

export {
  type IndexingOrchestrator,
  type IndexingOrchestratorOptions,
  type OrchestratorState,
  createIndexingOrchestrator
} from "./indexingOrchestrator";
