/**
 * Phase 40 -- Native packaging module.
 *
 * Barrel exports for the native packaging decision module providing
 * types, capability matrix, and packaging decision utilities.
 */

export type {
  PackagingOption,
  SupportLevel,
  TargetPlatform,
  PlatformSupport,
  CapabilityComparison,
  PackagingDecision,
} from './types';

export {
  getCapabilityMatrix,
  getCapabilitiesByImportance,
  getPwaGaps,
  getCapacitorAdvantages,
  getPackagingDecision,
} from './capability-matrix';
