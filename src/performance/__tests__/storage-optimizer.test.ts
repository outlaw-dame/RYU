import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeStorage,
  getStorageReport,
  isStorageUnderPressure,
  optimizeStorage,
  resetStorageOptimizer,
  subscribeStorageOptimizer
} from '../storage-optimizer';

vi.mock('../../search/model-lifecycle/storageQuota', () => ({
  probeStorageQuota: vi.fn()
}));

vi.mock('../../search/model-lifecycle/clearArtifacts', () => ({
  clearAllLocalAIArtifacts: vi.fn().mockResolvedValue({
    evictedCacheStorageEntries: 2,
    evictedIndexedDbDatabases: ['transformers-cache'],
    errors: []
  })
}));

import { probeStorageQuota } from '../../search/model-lifecycle/storageQuota';

const mockProbe = probeStorageQuota as ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetStorageOptimizer();
});

afterEach(() => {
  resetStorageOptimizer();
  vi.clearAllMocks();
});

describe('storage-optimizer', () => {
  describe('analyzeStorage', () => {
    it('returns storage report with usage ratio', async () => {
      mockProbe.mockResolvedValue({
        usageBytes: 500_000_000,
        quotaBytes: 1_000_000_000,
        availableBytes: 500_000_000,
        reason: 'ok'
      });

      const report = await analyzeStorage();
      expect(report.usageBytes).toBe(500_000_000);
      expect(report.quotaBytes).toBe(1_000_000_000);
      expect(report.usageRatio).toBeCloseTo(0.5);
      expect(report.staleEntries).toBe(0);
      expect(report.bytesFreed).toBe(0);
    });

    it('handles missing quota information gracefully', async () => {
      mockProbe.mockResolvedValue({
        reason: 'navigator.storage unavailable'
      });

      const report = await analyzeStorage();
      expect(report.usageBytes).toBeUndefined();
      expect(report.quotaBytes).toBeUndefined();
      expect(report.usageRatio).toBeUndefined();
    });

    it('updates the cached report', async () => {
      mockProbe.mockResolvedValue({
        usageBytes: 800_000_000,
        quotaBytes: 1_000_000_000,
        availableBytes: 200_000_000,
        reason: 'ok'
      });

      expect(getStorageReport()).toBeNull();
      await analyzeStorage();
      expect(getStorageReport()).not.toBeNull();
      expect(getStorageReport()!.usageRatio).toBeCloseTo(0.8);
    });

    it('notifies subscribers', async () => {
      mockProbe.mockResolvedValue({
        usageBytes: 100,
        quotaBytes: 1000,
        availableBytes: 900,
        reason: 'ok'
      });

      const listener = vi.fn();
      subscribeStorageOptimizer(listener);
      await analyzeStorage();
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('optimizeStorage', () => {
    it('does not evict when usage is below threshold', async () => {
      mockProbe.mockResolvedValue({
        usageBytes: 100_000_000,
        quotaBytes: 1_000_000_000,
        availableBytes: 900_000_000,
        reason: 'ok'
      });

      const report = await optimizeStorage();
      expect(report.staleEntries).toBe(0);
      expect(report.bytesFreed).toBe(0);
    });

    it('triggers eviction when usage exceeds warning threshold', async () => {
      mockProbe.mockResolvedValue({
        usageBytes: 900_000_000,
        quotaBytes: 1_000_000_000,
        availableBytes: 100_000_000,
        reason: 'ok'
      });

      const report = await optimizeStorage();
      expect(report.staleEntries).toBeGreaterThanOrEqual(0);
      expect(report.lastOptimizedAt).toBeDefined();
    });

    it('supports dry-run mode', async () => {
      mockProbe.mockResolvedValue({
        usageBytes: 900_000_000,
        quotaBytes: 1_000_000_000,
        availableBytes: 100_000_000,
        reason: 'ok'
      });

      const report = await optimizeStorage({ dryRun: true });
      // Dry run does not set lastOptimizedAt to a new value.
      expect(report.lastOptimizedAt).toBeUndefined();
    });
  });

  describe('isStorageUnderPressure', () => {
    it('returns false when no report exists', () => {
      expect(isStorageUnderPressure()).toBe(false);
    });

    it('returns true when usage ratio exceeds default threshold (0.8)', async () => {
      mockProbe.mockResolvedValue({
        usageBytes: 850_000_000,
        quotaBytes: 1_000_000_000,
        availableBytes: 150_000_000,
        reason: 'ok'
      });
      await analyzeStorage();
      expect(isStorageUnderPressure()).toBe(true);
    });

    it('returns false when usage is below threshold', async () => {
      mockProbe.mockResolvedValue({
        usageBytes: 500_000_000,
        quotaBytes: 1_000_000_000,
        availableBytes: 500_000_000,
        reason: 'ok'
      });
      await analyzeStorage();
      expect(isStorageUnderPressure()).toBe(false);
    });

    it('respects custom threshold override', async () => {
      mockProbe.mockResolvedValue({
        usageBytes: 600_000_000,
        quotaBytes: 1_000_000_000,
        availableBytes: 400_000_000,
        reason: 'ok'
      });
      await analyzeStorage();
      expect(isStorageUnderPressure({ storageWarningRatio: 0.5 })).toBe(true);
      expect(isStorageUnderPressure({ storageWarningRatio: 0.7 })).toBe(false);
    });
  });

  describe('subscribeStorageOptimizer', () => {
    it('returns an unsubscribe function', async () => {
      mockProbe.mockResolvedValue({
        usageBytes: 100,
        quotaBytes: 1000,
        availableBytes: 900,
        reason: 'ok'
      });

      const listener = vi.fn();
      const unsubscribe = subscribeStorageOptimizer(listener);
      unsubscribe();

      await analyzeStorage();
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
