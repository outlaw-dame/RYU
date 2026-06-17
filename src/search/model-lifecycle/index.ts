/**
 * Phase 14 — Public API barrel for the model-lifecycle subsystem.
 */

export {
  type EmbeddingArtifactId,
  type EmbeddingArtifactRecord,
  getEmbeddingArtifactRecord,
  getModelRegistryVersion,
  listEmbeddingArtifactRecords,
  modelCacheNamespace
} from "./modelRegistry";

export {
  type ModelDownloadState,
  type ModelStatus,
  getAllModelStatuses,
  getModelStatus,
  markDisabled,
  markDownloading,
  markFailed,
  markReady,
  resetAllModelStatuses,
  resetModelStatus,
  subscribeModelStatus
} from "./modelStatus";

export {
  type StorageQuoteEstimate,
  hasStorageHeadroomFor,
  isLowMemoryEnvironment,
  probeStorageQuota
} from "./storageQuota";

export {
  type ClearArtifactsReport,
  clearAllLocalAIArtifacts,
  registerExtractorResetHook
} from "./clearArtifacts";
