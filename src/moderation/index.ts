/**
 * Phase 35/36 - Moderation barrel exports.
 *
 * Central export point for all moderation, safety, and user control modules.
 */

// ─── Legacy Types (Phase 35) ──────────────────────────────────────────────────

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

// ─── Policy Types (Phase 36) ──────────────────────────────────────────────────

export type {
  FilterContext,
  PolicyFilterAction,
  PolicyKeyword,
  PolicyFilter,
  AccountModerationAction,
  PolicyAccount,
  DomainModerationSeverity,
  PolicyDomain,
  PolicyRelationship,
  ReportCategory,
  ReportStatus,
  PolicyReport,
  ModerationSyncState,
  BookSafetyLabel,
  LabelSeverity,
  SafetyLabel,
  NotificationTrustLevel,
  NotificationModerationCategory,
  PolicyEvaluationContext,
  PolicyDecision
} from "./policy-types";

// ─── Mute store ───────────────────────────────────────────────────────────────

export {
  loadMuteList,
  saveMuteList,
  addMute,
  removeMute,
  isMuted,
  getMuteEntry,
  purgeExpiredMutes
} from "./mute-store";

// ─── Block store ──────────────────────────────────────────────────────────────

export {
  loadBlockList,
  saveBlockList,
  addBlock,
  removeBlock,
  isBlocked,
  getBlockEntry
} from "./block-store";

// ─── Domain block store ───────────────────────────────────────────────────────

export {
  loadDomainBlockList,
  saveDomainBlockList,
  addDomainBlock,
  removeDomainBlock,
  isDomainBlocked,
  isAccountDomainBlocked,
  extractDomain
} from "./domain-block-store";

// ─── Content filter ───────────────────────────────────────────────────────────

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

// ─── Safe search ──────────────────────────────────────────────────────────────

export {
  loadSafeSearchLevel,
  saveSafeSearchLevel,
  shouldFilterSensitive,
  hasContentWarning,
  DEFAULT_SAFE_SEARCH_LEVEL
} from "./safe-search";

// ─── Legacy moderation engine ─────────────────────────────────────────────────

export type { ModerationInput, ModerationContext } from "./moderation-engine";
export {
  evaluateModeration,
  shouldHideContent,
  shouldWarnContent
} from "./moderation-engine";

// ─── Policy Engine (Phase 36) ─────────────────────────────────────────────────

export type { PolicyInput, PolicyStoreState } from "./policy-engine";
export {
  evaluatePolicy,
  matchesFilterKeywords,
  isFilterExpired,
  createSafetyLabel,
  BOOK_SAFETY_LABELS,
  normalizeMastodonFilter,
  normalizeMastodonRelationship
} from "./policy-engine";

// ─── Notification filter ──────────────────────────────────────────────────────

export type {
  NotificationInput,
  NotificationModerationResult
} from "./notification-filter";
export {
  evaluateNotification,
  filterNotifications
} from "./notification-filter";

// ─── Search moderation filter ─────────────────────────────────────────────────

export type {
  SearchModerationInput,
  SearchModerationState
} from "./search-moderation-filter";
export {
  shouldExcludeFromSearch,
  filterSearchResults
} from "./search-moderation-filter";

// ─── Report flow ──────────────────────────────────────────────────────────────

export type { CreateReportParams, SubmitReportResult } from "./report-flow";
export {
  createReport,
  validateReport,
  markReportSubmitted,
  markReportFailed,
  buildMastodonReportPayload
} from "./report-flow";

// ─── Relationship hydration ───────────────────────────────────────────────────

export type { RelationshipCache, RelationshipFetcher, HydrationOptions } from "./relationship-hydration";
export { createRelationshipHydrator } from "./relationship-hydration";

// ─── Moderation schema (RxDB) ─────────────────────────────────────────────────

export { moderationCollections } from "./moderation-schema";

// ─── Shared utilities ─────────────────────────────────────────────────────────

export { buildKeywordRegex, isCjkText, hasNonAsciiWordChars } from "./keyword-utils";
export { isMuteExpired, extractDomainFromAcct } from "./shared-utils";
