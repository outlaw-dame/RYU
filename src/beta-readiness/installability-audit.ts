/**
 * Phase 39 -- Installability audit.
 *
 * Validates PWA manifest fields, service worker registration,
 * and HTTPS requirement for beta installability.
 */

import type { CheckResult } from './types';

export interface ManifestData {
  display?: string;
  icons?: Array<{ src: string; sizes: string; type?: string; purpose?: string }>;
  start_url?: string;
  share_target?: Record<string, unknown>;
  protocol_handlers?: Array<{ protocol: string; url: string }>;
  name?: string;
  short_name?: string;
}

/**
 * Run installability checks against the provided manifest data
 * and environment info.
 */
export function runInstallabilityAudit(
  manifest: ManifestData,
  options: {
    serviceWorkerRegistered: boolean;
    isHttps: boolean;
  }
): CheckResult[] {
  const results: CheckResult[] = [];

  // Check display mode
  results.push({
    name: 'Manifest display mode',
    category: 'installability',
    passed: manifest.display === 'standalone' || manifest.display === 'fullscreen',
    description: 'Manifest must specify standalone or fullscreen display mode for installability.',
    severity: 'critical',
    ...(manifest.display !== 'standalone' && manifest.display !== 'fullscreen'
      ? { failureReason: `display is "${manifest.display ?? 'undefined'}", expected "standalone" or "fullscreen"` }
      : {}),
  });

  // Check icons
  const hasRequiredIcons = Array.isArray(manifest.icons) && manifest.icons.length >= 2;
  const has192 = manifest.icons?.some((i) => i.sizes?.includes('192x192')) ?? false;
  const has512 = manifest.icons?.some((i) => i.sizes?.includes('512x512')) ?? false;
  results.push({
    name: 'Manifest icons (192x192 and 512x512)',
    category: 'installability',
    passed: hasRequiredIcons && has192 && has512,
    description: 'Manifest must include at least 192x192 and 512x512 icons for PWA install.',
    severity: 'critical',
    ...(!hasRequiredIcons || !has192 || !has512
      ? { failureReason: `Missing required icon sizes. Has 192: ${has192}, has 512: ${has512}` }
      : {}),
  });

  // Check start_url
  results.push({
    name: 'Manifest start_url',
    category: 'installability',
    passed: typeof manifest.start_url === 'string' && manifest.start_url.length > 0,
    description: 'Manifest must specify a start_url.',
    severity: 'critical',
    ...(typeof manifest.start_url !== 'string' || manifest.start_url.length === 0
      ? { failureReason: 'start_url is missing or empty' }
      : {}),
  });

  // Check share_target
  const hasShareTarget = manifest.share_target != null && typeof manifest.share_target === 'object';
  results.push({
    name: 'Manifest share_target',
    category: 'installability',
    passed: hasShareTarget,
    description: 'Manifest should include share_target for content sharing capability.',
    severity: 'warning',
    ...(!hasShareTarget ? { failureReason: 'share_target is not defined' } : {}),
  });

  // Check protocol_handlers
  const hasProtocolHandlers =
    Array.isArray(manifest.protocol_handlers) && manifest.protocol_handlers.length > 0;
  results.push({
    name: 'Manifest protocol_handlers',
    category: 'installability',
    passed: hasProtocolHandlers,
    description: 'Manifest should include protocol_handlers for deep linking.',
    severity: 'warning',
    ...(!hasProtocolHandlers ? { failureReason: 'protocol_handlers is not defined or empty' } : {}),
  });

  // Check service worker registration
  results.push({
    name: 'Service worker registered',
    category: 'installability',
    passed: options.serviceWorkerRegistered,
    description: 'A service worker must be registered for PWA installability.',
    severity: 'critical',
    ...(!options.serviceWorkerRegistered
      ? { failureReason: 'No service worker registration detected' }
      : {}),
  });

  // Check HTTPS
  results.push({
    name: 'HTTPS requirement',
    category: 'installability',
    passed: options.isHttps,
    description: 'App must be served over HTTPS (or localhost) for PWA install.',
    severity: 'critical',
    ...(!options.isHttps ? { failureReason: 'App is not served over HTTPS' } : {}),
  });

  // Check name/short_name
  const hasName =
    (typeof manifest.name === 'string' && manifest.name.length > 0) ||
    (typeof manifest.short_name === 'string' && manifest.short_name.length > 0);
  results.push({
    name: 'Manifest name or short_name',
    category: 'installability',
    passed: hasName,
    description: 'Manifest must include name or short_name.',
    severity: 'critical',
    ...(!hasName ? { failureReason: 'Neither name nor short_name is defined' } : {}),
  });

  return results;
}
