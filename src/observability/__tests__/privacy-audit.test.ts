import { describe, expect, it } from 'vitest';
import { auditPrivacy } from '../privacy-audit';
import type { HealthExport, DiagnosticReport } from '../types';

function makeCleanExport(): HealthExport {
  return {
    version: 1,
    exportedAt: '2024-01-01T00:00:00.000Z',
    subsystems: [
      {
        name: 'search',
        status: 'healthy',
        lastHealthyAt: '2024-01-01T00:00:00.000Z',
        metrics: { pending: 0, active: 0 },
      },
    ],
    recentLogs: [
      {
        id: 'log_1',
        timestamp: '2024-01-01T00:00:00.000Z',
        level: 'info',
        category: 'search',
        message: 'Index rebuilt in 42ms',
        metadata: { count: 10 },
      },
    ],
    privacyAuditPassed: true,
  };
}

describe('auditPrivacy', () => {
  it('passes for a clean export with no PII', () => {
    const doc = makeCleanExport();
    const result = auditPrivacy(doc);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('detects bearer tokens in log messages', () => {
    const doc = makeCleanExport();
    doc.recentLogs[0].message = 'Auth: Bearer aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890abcd';
    const result = auditPrivacy(doc);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.description.includes('Bearer token'))).toBe(true);
  });

  it('detects email addresses', () => {
    const doc = makeCleanExport();
    doc.recentLogs[0].message = 'Login from alice@example.com';
    const result = auditPrivacy(doc);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.description.includes('Email address'))).toBe(true);
  });

  it('detects Mastodon handles', () => {
    const doc = makeCleanExport();
    doc.recentLogs[0].message = 'Following @alice@mastodon.social';
    const result = auditPrivacy(doc);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.description.includes('Mastodon handle'))).toBe(true);
  });

  it('detects URLs with user paths', () => {
    const doc = makeCleanExport();
    doc.recentLogs[0].message = 'Fetching https://mastodon.social/users/alice/statuses/123';
    const result = auditPrivacy(doc);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.description.includes('URL with user path'))).toBe(true);
  });

  it('detects long token-like strings', () => {
    const doc = makeCleanExport();
    doc.recentLogs[0].message = 'Token: aAbBcCdDeEfFgGhHiIjJkKlLmMnNoOpPqQ';
    const result = auditPrivacy(doc);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.description.includes('token'))).toBe(true);
  });

  it('detects non-redacted values in sensitive metadata keys', () => {
    const doc = makeCleanExport();
    doc.recentLogs[0].metadata = { query: 'my secret search' } as Record<string, string | number | boolean>;
    const result = auditPrivacy(doc);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.description.includes('Sensitive key'))).toBe(true);
  });

  it('passes when sensitive keys have redacted values', () => {
    const doc = makeCleanExport();
    doc.recentLogs[0].metadata = { query: '[REDACTED]' } as Record<string, string | number | boolean>;
    const result = auditPrivacy(doc);
    expect(result.passed).toBe(true);
  });

  it('scans nested subsystem metrics', () => {
    const doc = makeCleanExport();
    // metrics should only contain numbers, but test the scanner handles edge cases
    (doc.subsystems[0].metrics as Record<string, unknown>)['note'] = 'user@example.com sent this';
    const result = auditPrivacy(doc);
    expect(result.passed).toBe(false);
  });

  it('works with DiagnosticReport type', () => {
    const report: DiagnosticReport = {
      version: 1,
      generatedAt: '2024-01-01T00:00:00.000Z',
      subsystems: [],
      recentLogs: [],
      performanceSummary: {
        memoryPressure: 'none',
        renderBudgetExceeded: false,
        storageUsageRatio: 0.3,
      },
      syncQueueSummary: {
        pending: 0,
        processing: 0,
        completed: 5,
        failed: 0,
      },
      privacyAuditPassed: true,
    };
    const result = auditPrivacy(report);
    expect(result.passed).toBe(true);
  });
});
