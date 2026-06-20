/**
 * Phase 39 -- Service worker audit.
 *
 * Validates sw.js registration, caching strategy, and offline capability.
 */

import type { CheckResult } from './types';

export interface ServiceWorkerInfo {
  /** Whether the service worker file exists and is reachable. */
  fileExists: boolean;
  /** Whether the registration code is present in the app entry point. */
  registrationCodePresent: boolean;
  /** Whether a caching strategy is defined (static + image caches). */
  cachingStrategyDefined: boolean;
  /** Whether the service worker handles the activate event (for cache cleanup). */
  handlesActivateEvent: boolean;
  /** Whether the service worker handles the fetch event. */
  handlesFetchEvent: boolean;
  /** Whether the service worker includes offline fallback logic. */
  hasOfflineFallback: boolean;
  /** Whether stale-while-revalidate pattern is used. */
  usesStaleWhileRevalidate: boolean;
}

/**
 * Run service worker audit checks.
 */
export function runServiceWorkerAudit(info: ServiceWorkerInfo): CheckResult[] {
  const results: CheckResult[] = [];

  results.push({
    name: 'Service worker file exists',
    category: 'service-worker',
    passed: info.fileExists,
    description: 'The sw.js file must exist in the public directory.',
    severity: 'critical',
    ...(!info.fileExists ? { failureReason: 'sw.js file not found' } : {}),
  });

  results.push({
    name: 'Service worker registration in app entry',
    category: 'service-worker',
    passed: info.registrationCodePresent,
    description: 'The app entry point must register the service worker.',
    severity: 'critical',
    ...(!info.registrationCodePresent
      ? { failureReason: 'Service worker registration code not found in main entry' }
      : {}),
  });

  results.push({
    name: 'Caching strategy defined',
    category: 'service-worker',
    passed: info.cachingStrategyDefined,
    description: 'Service worker must define cache names and a caching strategy.',
    severity: 'critical',
    ...(!info.cachingStrategyDefined
      ? { failureReason: 'No caching strategy (cache names) found in sw.js' }
      : {}),
  });

  results.push({
    name: 'Activate event handler',
    category: 'service-worker',
    passed: info.handlesActivateEvent,
    description: 'Service worker must handle the activate event for cache cleanup.',
    severity: 'critical',
    ...(!info.handlesActivateEvent
      ? { failureReason: 'No activate event handler found in sw.js' }
      : {}),
  });

  results.push({
    name: 'Fetch event handler',
    category: 'service-worker',
    passed: info.handlesFetchEvent,
    description: 'Service worker must handle the fetch event for offline support.',
    severity: 'critical',
    ...(!info.handlesFetchEvent
      ? { failureReason: 'No fetch event handler found in sw.js' }
      : {}),
  });

  results.push({
    name: 'Offline fallback logic',
    category: 'service-worker',
    passed: info.hasOfflineFallback,
    description: 'Service worker should provide offline fallback responses.',
    severity: 'warning',
    ...(!info.hasOfflineFallback
      ? { failureReason: 'No offline fallback logic detected (cache-first or stale-while-revalidate)' }
      : {}),
  });

  results.push({
    name: 'Stale-while-revalidate pattern',
    category: 'service-worker',
    passed: info.usesStaleWhileRevalidate,
    description: 'Service worker should use stale-while-revalidate for optimal offline UX.',
    severity: 'warning',
    ...(!info.usesStaleWhileRevalidate
      ? { failureReason: 'staleWhileRevalidate pattern not detected' }
      : {}),
  });

  return results;
}
