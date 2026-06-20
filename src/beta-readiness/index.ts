/**
 * Phase 39 -- Beta readiness module.
 *
 * Barrel exports for the beta readiness audit providing installability,
 * service worker, data migration, settings audits, known limitations,
 * and a programmatic release checklist.
 */

export type {
  CheckCategory,
  CheckResult,
  BetaReadinessReport,
} from './types';

export {
  runInstallabilityAudit,
} from './installability-audit';
export type { ManifestData } from './installability-audit';

export {
  runServiceWorkerAudit,
} from './service-worker-audit';
export type { ServiceWorkerInfo } from './service-worker-audit';

export {
  runDataMigrationAudit,
} from './data-migration-audit';
export type { DataMigrationInfo } from './data-migration-audit';

export {
  runSettingsAudit,
} from './settings-audit';
export type { SettingsInfo } from './settings-audit';

export {
  getKnownLimitations,
  getKnownLimitationSummaries,
} from './known-limitations';
export type { KnownLimitation } from './known-limitations';

export {
  runReleaseChecklist,
  formatReport,
} from './release-checklist';
export type { ReleaseChecklistInput } from './release-checklist';
