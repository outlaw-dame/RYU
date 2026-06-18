/**
 * Phase 27: Entity resolution barrel exports.
 */

export type {
  MergeOperation,
  MergeResult,
  MergeCandidate,
  UndoSnapshot,
  ResolutionRecord
} from './types';

export {
  normalizeForComparison,
  parseAuthorName,
  canonicalizeAuthorName,
  compareAuthorNames,
  findAuthorAliases
} from './author-normalizer';

export {
  writeResolution,
  resolveUri,
  getAliasesForEntity,
  removeResolution,
  writeResolutions,
  resolveEntityUri
} from './resolution-store';

export {
  executeMerge,
  undoMerge
} from './merge-engine';

export {
  getUndoSnapshots,
  saveUndoSnapshot,
  getUndoSnapshotById,
  removeUndoSnapshot,
  clearUndoHistory,
  getUndoCount
} from './undo-store';
