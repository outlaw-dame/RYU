import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportHealth } from '../health-exporter';
import { getLogger, resetAllLoggers } from '../redacted-logger';
import { auditPrivacy } from '../privacy-audit';

// Mock the dynamic imports so tests don't depend on full subsystem setup
vi.mock('../search/observability/searchDiagnosticsSnapshot', () => ({
  captureSearchDiagnosticsSnapshot: vi.fn(),
}));

beforeEach(() => {
  resetAllLoggers();
});

afterEach(() => {
  resetAllLoggers();
  vi.restoreAllMocks();
});

describe('exportHealth', () => {
  it('returns a valid HealthExport document', async () => {
    const result = await exportHealth();

    expect(result.version).toBe(1);
    expect(result.exportedAt).toBeTruthy();
    expect(result.subsystems).toBeInstanceOf(Array);
    expect(result.subsystems.length).toBeGreaterThan(0);
    expect(result.recentLogs).toBeInstanceOf(Array);
    expect(typeof result.privacyAuditPassed).toBe('boolean');
  });

  it('includes subsystem health for known subsystems', async () => {
    const result = await exportHealth();

    const names = result.subsystems.map((s) => s.name);
    // At minimum should have the 4 built-in collectors
    expect(names).toContain('search');
    expect(names).toContain('sync');
    expect(names).toContain('storage');
    expect(names).toContain('performance');
  });

  it('includes recent redacted log entries', async () => {
    const logger = getLogger('search');
    logger.info('Index rebuilt successfully');
    logger.warn('Stale entries detected');

    const result = await exportHealth({ maxLogEntries: 50 });
    expect(result.recentLogs.length).toBe(2);
  });

  it('limits log entries to maxLogEntries option', async () => {
    const logger = getLogger('search');
    for (let i = 0; i < 20; i++) {
      logger.info(`msg ${i}`);
    }

    const result = await exportHealth({ maxLogEntries: 5 });
    expect(result.recentLogs.length).toBe(5);
  });

  it('passes privacy audit for clean data', async () => {
    const logger = getLogger('search');
    logger.info('Healthy state');

    const result = await exportHealth();
    expect(result.privacyAuditPassed).toBe(true);
    // Double-check with direct audit
    const audit = auditPrivacy(result);
    expect(audit.passed).toBe(true);
  });

  it('includes custom subsystem providers', async () => {
    const customProvider = () => ({
      name: 'custom',
      status: 'healthy' as const,
      lastHealthyAt: '2024-01-01T00:00:00.000Z',
      metrics: { custom_metric: 42 },
    });

    const result = await exportHealth({ subsystemProviders: [customProvider] });
    const custom = result.subsystems.find((s) => s.name === 'custom');
    expect(custom).toBeDefined();
    expect(custom?.metrics.custom_metric).toBe(42);
  });

  it('each subsystem has required fields', async () => {
    const result = await exportHealth();
    for (const subsystem of result.subsystems) {
      expect(subsystem.name).toBeTruthy();
      expect(['healthy', 'degraded', 'error', 'unknown']).toContain(subsystem.status);
      expect(subsystem.metrics).toBeDefined();
      expect(typeof subsystem.metrics).toBe('object');
    }
  });
});
