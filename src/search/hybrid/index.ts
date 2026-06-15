/**
 * Public API for the hybrid search engine layer.
 */

export type {
  HybridSearchQuery,
  HybridSearchResponse,
  HybridSearchDiagnostics,
  LocalHybridSearchEngine
} from "./hybridSearchTypes";

export type {
  ProgressiveSearchUpdate,
  ProgressiveUpdateHandler,
  SearchError
} from "./progressiveSearch";

export { searchProgressively } from "./progressiveSearch";

export { createRxDbOramaHybridSearchEngine } from "./RxDbOramaHybridSearchEngine";
