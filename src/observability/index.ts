/**
 * Phase 38 -- Privacy-preserving observability.
 *
 * Barrel exports for the observability module providing structured
 * logging, health exports, diagnostic collection, and privacy auditing.
 */

export type {
  DiagnosticCategory,
  PrivacyLevel,
  LogLevel,
  RedactedLog,
  SubsystemHealth,
  HealthExport,
  DiagnosticReport,
} from './types';

export {
  RedactedLogger,
  getLogger,
  getAllLogEntries,
  resetAllLoggers,
  redactMessage,
  redactMetadata,
} from './redacted-logger';

export { exportHealth } from './health-exporter';
export type { HealthExportOptions } from './health-exporter';

export { collectDiagnosticReport } from './diagnostic-collector';

export { auditPrivacy } from './privacy-audit';
export type { PrivacyAuditResult, PrivacyViolation } from './privacy-audit';
