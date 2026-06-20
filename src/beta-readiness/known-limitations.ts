/**
 * Phase 39 -- Known limitations.
 *
 * Documents known limitations for beta users in a structured format.
 * These are not failures but rather areas where the app has intentional
 * constraints or features not yet implemented.
 */

export interface KnownLimitation {
  /** Unique identifier for the limitation. */
  id: string;
  /** Human-readable title. */
  title: string;
  /** Detailed description of the limitation. */
  description: string;
  /** Category of the limitation. */
  category: 'feature' | 'platform' | 'performance' | 'data' | 'integration';
  /** Impact on user experience. */
  impact: 'low' | 'medium' | 'high';
  /** Workaround if available. */
  workaround?: string;
  /** Phase that will address this limitation (if planned). */
  plannedResolution?: string;
}

/**
 * Returns the list of known limitations for the current beta release.
 */
export function getKnownLimitations(): KnownLimitation[] {
  return [
    {
      id: 'no-federated-discovery',
      title: 'Federated discovery is not yet available',
      description:
        'Server-side search and federated book discovery are disabled. ' +
        'Search operates locally only against books already in your library.',
      category: 'feature',
      impact: 'medium',
      workaround: 'Manually add books via ISBN or URL sharing.',
      plannedResolution: 'Phase 20 backend integration',
    },
    {
      id: 'offline-limited-to-cached',
      title: 'Offline mode limited to cached content',
      description:
        'When offline, only previously loaded pages and cached images are available. ' +
        'New searches and book imports require network connectivity.',
      category: 'platform',
      impact: 'medium',
      workaround: 'Ensure important content is loaded while online.',
    },
    {
      id: 'no-full-database-export',
      title: 'Full database export not yet available in UI',
      description:
        'While RxDB supports JSON export, the UI does not yet expose a full backup/export button. ' +
        'Data persists in IndexedDB and is durable via navigator.storage.persist().',
      category: 'data',
      impact: 'low',
      workaround: 'Data is stored locally and persists across sessions.',
      plannedResolution: 'Backup/restore feature in future phase',
    },
    {
      id: 'ai-model-download-required',
      title: 'AI models require initial download',
      description:
        'Semantic search models (MiniLM/EmbeddingGemma) need to be downloaded on first use. ' +
        'This may take time on slower connections. Deterministic fallback works immediately.',
      category: 'performance',
      impact: 'low',
      workaround: 'Deterministic search works immediately without model download.',
    },
    {
      id: 'ios-pwa-limitations',
      title: 'iOS PWA has platform restrictions',
      description:
        'iOS Safari limits PWA capabilities: no background sync, limited storage quota, ' +
        'no push notifications. The app adapts but some features are reduced.',
      category: 'platform',
      impact: 'medium',
      workaround: 'Core reading and search features work fully on iOS.',
    },
    {
      id: 'mastodon-auth-not-yet-integrated',
      title: 'Mastodon authentication is in development',
      description:
        'OAuth flow for Mastodon instances is implemented but not yet integrated into ' +
        'the main app UI. Social features require manual configuration.',
      category: 'integration',
      impact: 'medium',
      plannedResolution: 'Mastodon OAuth UI integration phase',
    },
    {
      id: 'no-push-notifications',
      title: 'Push notifications not supported',
      description:
        'The app does not currently send push notifications for social activity ' +
        'or reading reminders.',
      category: 'feature',
      impact: 'low',
      plannedResolution: 'Future notification phase',
    },
    {
      id: 'storage-quota-browser-dependent',
      title: 'Storage quota varies by browser',
      description:
        'Available storage depends on browser implementation. Large libraries ' +
        'may hit quota limits on some browsers, especially in private/incognito mode.',
      category: 'platform',
      impact: 'low',
      workaround: 'Use a regular (non-incognito) browser window for persistent storage.',
    },
  ];
}

/**
 * Returns limitation summaries as a flat string array (for report inclusion).
 */
export function getKnownLimitationSummaries(): string[] {
  return getKnownLimitations().map((l) => `[${l.category}/${l.impact}] ${l.title}: ${l.description}`);
}
