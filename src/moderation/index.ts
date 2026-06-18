/**
 * Phase 35 - Moderation barrel exports.
 *
 * Central export point for all moderation, safety, and user control modules.
 */

// Types
export type {
  MuteEntry,
  BlockEntry,
  DomainBlock,
  ContentFilter,
  ContentFilterAction,
  SafeSearchLevel,
  ModerationDecision,
  ModerationResult
} from "./types";

// Mute store
export {
  loadMuteList,
  saveMuteList,
  addMute,
  removeMute,
  isMuted,
  getMuteEntry,
  purgeExpiredMutes
} from "./mute-store";

// Block store
export {
  loadBlockList,
  saveBlockList,
  addBlock,
  removeBlock,
  isBlocked,
  getBlockEntry
} from "./block-store";

// Domain block store
export {
  loadDomainBlockList,
  saveDomainBlockList,
  addDomainBlock,
  removeDomainBlock,
  isDomainBlocked,
  isAccountDomainBlocked,
  extractDomain
} from "./domain-block-store";

// Content filter
export {
  loadContentFilters,
  saveContentFilters,
  addContentFilter,
  removeContentFilter,
  updateContentFilter,
  matchesFilter,
  checkContentFilters,
  purgeExpiredFilters
} from "./content-filter";

// Safe search
export {
  loadSafeSearchLevel,
  saveSafeSearchLevel,
  shouldFilterSensitive,
  hasContentWarning,
  DEFAULT_SAFE_SEARCH_LEVEL
} from "./safe-search";

// Moderation engine
export type { ModerationInput, ModerationContext } from "./moderation-engine";
export {
  evaluateModeration,
  shouldHideContent,
  shouldWarnContent
} from "./moderation-engine";
