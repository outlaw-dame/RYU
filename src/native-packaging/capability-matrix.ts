/**
 * Phase 40 -- Capability matrix.
 *
 * Programmatic matrix comparing PWA vs Capacitor capabilities
 * per platform (iOS Safari, Android Chrome, Desktop).
 */

import type {
  CapabilityComparison,
  PackagingDecision,
  TargetPlatform,
  SupportLevel,
} from './types';

/**
 * Returns the full capability comparison matrix for PWA vs Capacitor.
 */
export function getCapabilityMatrix(): CapabilityComparison[] {
  return [
    {
      id: 'push-notifications',
      name: 'Push Notifications',
      description: 'Ability to send push notifications to users when the app is not active.',
      importance: 'high',
      pwaSupport: [
        { platform: 'ios-safari', support: 'full', notes: 'Requires iOS 16.4+, standalone mode', minVersion: '16.4' },
        { platform: 'android-chrome', support: 'full', notes: 'Standard Push API + Service Worker' },
        { platform: 'desktop', support: 'full', notes: 'All major browsers support Web Push' },
      ],
      capacitorSupport: [
        { platform: 'ios-safari', support: 'full', notes: 'APNs via native plugin' },
        { platform: 'android-chrome', support: 'full', notes: 'FCM via native plugin' },
        { platform: 'desktop', support: 'none', notes: 'Capacitor does not target desktop' },
      ],
    },
    {
      id: 'badge-api',
      name: 'Badge API',
      description: 'Display unread count badge on the app icon.',
      importance: 'low',
      pwaSupport: [
        { platform: 'ios-safari', support: 'none', notes: 'Not supported in iOS Safari PWA' },
        { platform: 'android-chrome', support: 'full', notes: 'navigator.setAppBadge supported' },
        { platform: 'desktop', support: 'full', notes: 'Supported on macOS and Windows' },
      ],
      capacitorSupport: [
        { platform: 'ios-safari', support: 'full', notes: 'Native badge via UIApplication' },
        { platform: 'android-chrome', support: 'full', notes: 'Native badge via ShortcutBadger or similar' },
        { platform: 'desktop', support: 'none', notes: 'Capacitor does not target desktop' },
      ],
    },
    {
      id: 'file-handling',
      name: 'File Handling API',
      description: 'Register as a handler for specific file types (EPUB, PDF).',
      importance: 'medium',
      pwaSupport: [
        { platform: 'ios-safari', support: 'none', notes: 'Not supported; fallback via file input element' },
        { platform: 'android-chrome', support: 'full', notes: 'File Handling API supported' },
        { platform: 'desktop', support: 'full', notes: 'Supported in Chromium browsers' },
      ],
      capacitorSupport: [
        { platform: 'ios-safari', support: 'full', notes: 'Native document type registration' },
        { platform: 'android-chrome', support: 'full', notes: 'Native intent filter for file types' },
        { platform: 'desktop', support: 'none', notes: 'Capacitor does not target desktop' },
      ],
    },
    {
      id: 'share-target',
      name: 'Share Target',
      description: 'Appear in the system share sheet to receive shared content.',
      importance: 'high',
      pwaSupport: [
        { platform: 'ios-safari', support: 'full', notes: 'Via manifest share_target in standalone mode' },
        { platform: 'android-chrome', support: 'full', notes: 'Full share_target manifest support' },
        { platform: 'desktop', support: 'partial', notes: 'Limited OS-level share sheet integration' },
      ],
      capacitorSupport: [
        { platform: 'ios-safari', support: 'full', notes: 'Native Share Extension' },
        { platform: 'android-chrome', support: 'full', notes: 'Native intent receiver' },
        { platform: 'desktop', support: 'none', notes: 'Capacitor does not target desktop' },
      ],
    },
    {
      id: 'background-sync',
      name: 'Background Sync',
      description: 'Sync data in the background when connectivity is restored.',
      importance: 'medium',
      pwaSupport: [
        { platform: 'ios-safari', support: 'none', notes: 'Not supported on iOS' },
        { platform: 'android-chrome', support: 'full', notes: 'Background Sync API supported' },
        { platform: 'desktop', support: 'full', notes: 'Supported in Chromium browsers' },
      ],
      capacitorSupport: [
        { platform: 'ios-safari', support: 'full', notes: 'Native background fetch' },
        { platform: 'android-chrome', support: 'full', notes: 'WorkManager for background tasks' },
        { platform: 'desktop', support: 'none', notes: 'Capacitor does not target desktop' },
      ],
    },
    {
      id: 'app-store-presence',
      name: 'App Store Presence',
      description: 'Listed in platform app stores for discoverability.',
      importance: 'low',
      pwaSupport: [
        { platform: 'ios-safari', support: 'none', notes: 'PWAs cannot be listed on iOS App Store' },
        { platform: 'android-chrome', support: 'partial', notes: 'TWA can be listed on Play Store' },
        { platform: 'desktop', support: 'partial', notes: 'Microsoft Store accepts PWAs' },
      ],
      capacitorSupport: [
        { platform: 'ios-safari', support: 'full', notes: 'Native app listing on App Store' },
        { platform: 'android-chrome', support: 'full', notes: 'Native app listing on Play Store' },
        { platform: 'desktop', support: 'none', notes: 'Capacitor does not target desktop' },
      ],
    },
    {
      id: 'persistent-storage',
      name: 'Persistent Storage',
      description: 'Reliable long-term data persistence without eviction risk.',
      importance: 'critical',
      pwaSupport: [
        { platform: 'ios-safari', support: 'partial', notes: 'Quota limits; possible 7-day eviction', minVersion: '15.0' },
        { platform: 'android-chrome', support: 'full', notes: 'navigator.storage.persist() available' },
        { platform: 'desktop', support: 'full', notes: 'Generous quotas with persistence API' },
      ],
      capacitorSupport: [
        { platform: 'ios-safari', support: 'full', notes: 'Native filesystem, no eviction' },
        { platform: 'android-chrome', support: 'full', notes: 'Native filesystem, no eviction' },
        { platform: 'desktop', support: 'none', notes: 'Capacitor does not target desktop' },
      ],
    },
    {
      id: 'biometric-auth',
      name: 'Biometric Authentication',
      description: 'Use fingerprint or face recognition for authentication.',
      importance: 'low',
      pwaSupport: [
        { platform: 'ios-safari', support: 'partial', notes: 'WebAuthn supported but limited UX' },
        { platform: 'android-chrome', support: 'partial', notes: 'WebAuthn supported' },
        { platform: 'desktop', support: 'partial', notes: 'WebAuthn with platform authenticator' },
      ],
      capacitorSupport: [
        { platform: 'ios-safari', support: 'full', notes: 'Native Face ID / Touch ID' },
        { platform: 'android-chrome', support: 'full', notes: 'Native BiometricPrompt' },
        { platform: 'desktop', support: 'none', notes: 'Capacitor does not target desktop' },
      ],
    },
    {
      id: 'deep-linking',
      name: 'Deep Linking',
      description: 'Handle custom URL schemes and universal links.',
      importance: 'medium',
      pwaSupport: [
        { platform: 'ios-safari', support: 'partial', notes: 'Web App Manifest scope handles HTTPS links' },
        { platform: 'android-chrome', support: 'full', notes: 'TWA supports intent filters and verified links' },
        { platform: 'desktop', support: 'partial', notes: 'protocol_handlers in manifest (Chromium only)' },
      ],
      capacitorSupport: [
        { platform: 'ios-safari', support: 'full', notes: 'Universal Links via Associated Domains' },
        { platform: 'android-chrome', support: 'full', notes: 'App Links with verified domain' },
        { platform: 'desktop', support: 'none', notes: 'Capacitor does not target desktop' },
      ],
    },
  ];
}

/**
 * Filter the capability matrix by importance level.
 */
export function getCapabilitiesByImportance(
  importance: CapabilityComparison['importance']
): CapabilityComparison[] {
  return getCapabilityMatrix().filter((c) => c.importance === importance);
}

/**
 * Get all capabilities where PWA has a gap (none or partial) on a specific platform.
 */
export function getPwaGaps(platform: TargetPlatform): CapabilityComparison[] {
  return getCapabilityMatrix().filter((c) =>
    c.pwaSupport.some(
      (s) => s.platform === platform && (s.support === 'none' || s.support === 'partial')
    )
  );
}

/**
 * Get all capabilities where Capacitor provides an upgrade over PWA on a specific platform.
 */
export function getCapacitorAdvantages(platform: TargetPlatform): CapabilityComparison[] {
  return getCapabilityMatrix().filter((c) => {
    const pwa = c.pwaSupport.find((s) => s.platform === platform);
    const cap = c.capacitorSupport.find((s) => s.platform === platform);
    if (!pwa || !cap) return false;
    const levels: Record<SupportLevel, number> = { none: 0, partial: 1, polyfill: 2, full: 3 };
    return levels[cap.support] > levels[pwa.support];
  });
}

/**
 * Returns the current packaging decision for RYU.
 */
export function getPackagingDecision(): PackagingDecision {
  return {
    chosen: 'pwa',
    rationale:
      'PWA capabilities cover all critical and high-importance features for beta. ' +
      'Push notifications work on iOS 16.4+, Share Target is functional via manifest, ' +
      'and the maintenance cost of Capacitor is not justified by marginal gains. ' +
      'Instant updates and zero-friction install are critical advantages during beta iteration.',
    deferredEvaluation: true,
    revisitConditions: [
      'User research shows significant install friction requiring app store presence',
      'EPUB/PDF file type registration becomes a priority feature',
      'Background sync becomes critical for social feed freshness',
      'iOS Badge API support does not materialize in future Safari versions',
    ],
  };
}
