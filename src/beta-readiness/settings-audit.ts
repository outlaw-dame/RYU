/**
 * Phase 39 -- Settings audit.
 *
 * Validates that feature flag defaults are production-safe,
 * debug panel is off by default, and federated discovery is disabled.
 */

import type { CheckResult } from './types';

export interface SettingsInfo {
  /** Feature flag defaults. */
  featureFlagDefaults: Record<string, boolean>;
  /** Whether debug_panel defaults to false. */
  debugPanelDefault: boolean;
  /** Whether federated_discovery defaults to false. */
  federatedDiscoveryDefault: boolean;
  /** Whether any experimental flags are enabled by default. */
  experimentalFlagsEnabled: string[];
}

/** Flags that MUST default to false for production safety. */
const MUST_BE_DISABLED: string[] = ['debug_panel', 'federated_discovery'];

/**
 * Run settings audit checks.
 */
export function runSettingsAudit(info: SettingsInfo): CheckResult[] {
  const results: CheckResult[] = [];

  // Debug panel must be off by default
  results.push({
    name: 'Debug panel disabled by default',
    category: 'settings',
    passed: info.debugPanelDefault === false,
    description: 'The debug panel must be disabled by default for production users.',
    severity: 'critical',
    ...(info.debugPanelDefault !== false
      ? { failureReason: 'debug_panel defaults to true -- must be false for production' }
      : {}),
  });

  // Federated discovery must be off
  results.push({
    name: 'Federated discovery disabled by default',
    category: 'settings',
    passed: info.federatedDiscoveryDefault === false,
    description: 'Federated discovery must be disabled until backend integration is complete.',
    severity: 'critical',
    ...(info.federatedDiscoveryDefault !== false
      ? { failureReason: 'federated_discovery defaults to true -- must be false until backend is ready' }
      : {}),
  });

  // All MUST_BE_DISABLED flags check
  for (const flag of MUST_BE_DISABLED) {
    const value = info.featureFlagDefaults[flag];
    if (value !== undefined) {
      results.push({
        name: `Flag "${flag}" production-safe default`,
        category: 'settings',
        passed: value === false,
        description: `"${flag}" must default to false for production safety.`,
        severity: 'critical',
        ...(value !== false
          ? { failureReason: `"${flag}" defaults to ${String(value)}, expected false` }
          : {}),
      });
    }
  }

  // Warn about any experimental flags that are enabled by default
  results.push({
    name: 'No experimental flags enabled by default',
    category: 'settings',
    passed: info.experimentalFlagsEnabled.length === 0,
    description: 'Experimental flags should not be enabled by default in production.',
    severity: 'warning',
    ...(info.experimentalFlagsEnabled.length > 0
      ? { failureReason: `Experimental flags enabled: ${info.experimentalFlagsEnabled.join(', ')}` }
      : {}),
  });

  return results;
}
