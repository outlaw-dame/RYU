/**
 * Phase 31 - Social activity module barrel exports.
 */

export type {
  BookActivity,
  BookActivityType,
  ActivityGroup,
  ActivityFilter,
  RemoteVisibility,
  CacheEligibility
} from "./types";

export { classifyActivity, classifyActivities } from "./activity-classifier";
export { groupActivities, getUngroupedActivities } from "./activity-grouper";
export {
  parseVisibility,
  getCacheEligibility,
  visibilityToScope,
  visibilityToSearchTier,
  isRemoteStatusExpired,
  filterCacheableStatuses,
  filterSearchableStatuses,
  isVisibleOnActivitySurface,
  getVisibilityInfo
} from "./visibility-guard";
