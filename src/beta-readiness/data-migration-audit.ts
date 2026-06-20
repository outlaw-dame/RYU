/**
 * Phase 39 -- Data migration audit.
 *
 * Validates schema version compatibility, migration strategies,
 * backup/restore state, and forward/backward migration safety.
 */

import type { CheckResult } from './types';

export interface DataMigrationInfo {
  /** Current schema version from runtime-schema. */
  currentSchemaVersion: number;
  /** Whether migration strategies exist for all versions up to current. */
  migrationStrategiesDefined: boolean;
  /** Whether forward migrations are safe (no data loss). */
  forwardMigrationSafe: boolean;
  /** Whether backward migrations (downgrades) are handled. */
  backwardMigrationSafe: boolean;
  /** Whether vectors can be rebuilt (derived data). */
  vectorRebuildCapable: boolean;
  /** Whether canonical data is preserved across migrations. */
  canonicalDataPreserved: boolean;
  /** Whether storage persistence is requested (navigator.storage.persist). */
  storagePersistenceAvailable: boolean;
  /** Whether enhanced search can be disabled without breaking the app. */
  enhancedSearchDisableSafe: boolean;
}

/**
 * Run data migration audit checks.
 */
export function runDataMigrationAudit(info: DataMigrationInfo): CheckResult[] {
  const results: CheckResult[] = [];

  results.push({
    name: 'Schema version defined',
    category: 'data-migration',
    passed: info.currentSchemaVersion > 0,
    description: 'A valid schema version must be defined for data migrations.',
    severity: 'critical',
    ...(info.currentSchemaVersion <= 0
      ? { failureReason: `Schema version is ${info.currentSchemaVersion}, expected > 0` }
      : {}),
  });

  results.push({
    name: 'Migration strategies defined',
    category: 'data-migration',
    passed: info.migrationStrategiesDefined,
    description: 'Migration strategies must exist for all schema versions.',
    severity: 'critical',
    ...(!info.migrationStrategiesDefined
      ? { failureReason: 'Missing migration strategies for one or more schema versions' }
      : {}),
  });

  results.push({
    name: 'Forward migration safety',
    category: 'data-migration',
    passed: info.forwardMigrationSafe,
    description: 'Upgrading schema must not cause data loss.',
    severity: 'critical',
    ...(!info.forwardMigrationSafe
      ? { failureReason: 'Forward migration may cause data loss' }
      : {}),
  });

  results.push({
    name: 'Backward migration safety (downgrade)',
    category: 'data-migration',
    passed: info.backwardMigrationSafe,
    description: 'Downgrading to a previous app version must not corrupt data.',
    severity: 'critical',
    ...(!info.backwardMigrationSafe
      ? { failureReason: 'Backward migration (downgrade) is not handled safely' }
      : {}),
  });

  results.push({
    name: 'Vector data rebuild capability',
    category: 'data-migration',
    passed: info.vectorRebuildCapable,
    description: 'Vector data (derived) must be rebuildable after migration.',
    severity: 'critical',
    ...(!info.vectorRebuildCapable
      ? { failureReason: 'Vector data cannot be rebuilt after migration' }
      : {}),
  });

  results.push({
    name: 'Canonical data preservation',
    category: 'data-migration',
    passed: info.canonicalDataPreserved,
    description: 'Canonical entity data must never be deleted during migration.',
    severity: 'critical',
    ...(!info.canonicalDataPreserved
      ? { failureReason: 'Canonical data may be lost during migration' }
      : {}),
  });

  results.push({
    name: 'Storage persistence available',
    category: 'data-migration',
    passed: info.storagePersistenceAvailable,
    description: 'navigator.storage.persist should be available for data durability.',
    severity: 'warning',
    ...(!info.storagePersistenceAvailable
      ? { failureReason: 'Storage persistence API not available' }
      : {}),
  });

  results.push({
    name: 'Enhanced search disable safety',
    category: 'data-migration',
    passed: info.enhancedSearchDisableSafe,
    description: 'Disabling enhanced search must not break the app.',
    severity: 'critical',
    ...(!info.enhancedSearchDisableSafe
      ? { failureReason: 'Disabling enhanced search would break app functionality' }
      : {}),
  });

  return results;
}
