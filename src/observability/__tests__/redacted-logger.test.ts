import { afterEach, describe, expect, it } from 'vitest';
import {
  RedactedLogger,
  getAllLogEntries,
  getLogger,
  redactMessage,
  redactMetadata,
  resetAllLoggers,
} from '../redacted-logger';

afterEach(() => {
  resetAllLoggers();
});

describe('redactMessage', () => {
  it('strips bearer tokens', () => {
    const msg = 'Auth failed with Bearer abc123xyz456abcdefghijk';
    const result = redactMessage(msg);
    expect(result).not.toContain('abc123xyz456abcdefghijk');
    expect(result).toContain('[REDACTED');
  });

  it('strips email addresses', () => {
    const msg = 'User login from user@example.com failed';
    const result = redactMessage(msg);
    expect(result).not.toContain('user@example.com');
    expect(result).toContain('[REDACTED_EMAIL]');
  });

  it('strips Mastodon handles', () => {
    const msg = 'Fetching profile for @alice@mastodon.social';
    const result = redactMessage(msg);
    expect(result).not.toContain('@alice@mastodon.social');
    expect(result).toContain('@[REDACTED_HANDLE]');
  });

  it('strips URLs with user paths', () => {
    const msg = 'Fetching https://mastodon.social/users/alice/statuses/123';
    const result = redactMessage(msg);
    expect(result).not.toContain('/users/alice');
    expect(result).toContain('[REDACTED_URL]');
  });

  it('strips URLs with @user paths', () => {
    const msg = 'Profile at https://mastodon.social/@bob';
    const result = redactMessage(msg);
    expect(result).not.toContain('@bob');
    expect(result).toContain('[REDACTED_URL]');
  });

  it('strips query parameters containing search text', () => {
    const msg = 'Search request: /api/search?q=my+secret+query&limit=20';
    const result = redactMessage(msg);
    expect(result).not.toContain('my+secret+query');
    expect(result).toContain('[REDACTED_QUERY]');
  });

  it('preserves non-sensitive content', () => {
    const msg = 'Index rebuild completed in 42ms';
    const result = redactMessage(msg);
    expect(result).toBe('Index rebuild completed in 42ms');
  });
});

describe('redactMetadata', () => {
  it('redacts sensitive keys', () => {
    const result = redactMetadata({
      query: 'harry potter',
      token: 'secret123',
      email: 'user@example.com',
      count: 5,
    });
    expect(result?.query).toBe('[REDACTED]');
    expect(result?.token).toBe('[REDACTED]');
    expect(result?.email).toBe('[REDACTED]');
    expect(result?.count).toBe(5);
  });

  it('redacts PII in non-sensitive string values', () => {
    const result = redactMetadata({
      context: 'Fetching https://mastodon.social/users/alice',
    });
    expect(result?.context).not.toContain('/users/alice');
  });

  it('returns undefined for undefined input', () => {
    expect(redactMetadata(undefined)).toBeUndefined();
  });
});

describe('RedactedLogger', () => {
  it('stores entries at all log levels', () => {
    const logger = new RedactedLogger('search');
    logger.debug('debug msg');
    logger.info('info msg');
    logger.warn('warn msg');
    logger.error('error msg');

    const entries = logger.getEntries();
    expect(entries).toHaveLength(4);
    expect(entries[0].level).toBe('debug');
    expect(entries[1].level).toBe('info');
    expect(entries[2].level).toBe('warn');
    expect(entries[3].level).toBe('error');
  });

  it('redacts tokens in messages at write time', () => {
    const logger = new RedactedLogger('auth');
    logger.info('Token Bearer aBcDeFgHiJkLmNoPqRsTuVwXyZ123456 was revoked');

    const entries = logger.getEntries();
    expect(entries[0].message).not.toContain('aBcDeFgHiJkLmNoPqRsTuVwXyZ123456');
    expect(entries[0].message).toContain('[REDACTED');
  });

  it('redacts sensitive metadata at write time', () => {
    const logger = new RedactedLogger('search');
    logger.info('Search performed', {
      query: 'secret book title',
      resultCount: 3,
    });

    const entries = logger.getEntries();
    expect(entries[0].metadata?.query).toBe('[REDACTED]');
    expect(entries[0].metadata?.resultCount).toBe(3);
  });

  it('enforces ring buffer limit of 500 entries', () => {
    const logger = new RedactedLogger('sync', 500);
    for (let i = 0; i < 600; i++) {
      logger.info(`msg ${i}`);
    }
    expect(logger.size).toBe(500);
    // First entries should have been evicted
    const entries = logger.getEntries();
    expect(entries[0].message).toContain('msg 100');
  });

  it('sets category correctly', () => {
    const logger = new RedactedLogger('moderation');
    logger.warn('Test');
    expect(logger.getEntries()[0].category).toBe('moderation');
  });

  it('assigns unique IDs and timestamps', () => {
    const logger = new RedactedLogger('network');
    logger.info('first');
    logger.info('second');
    const entries = logger.getEntries();
    expect(entries[0].id).not.toBe(entries[1].id);
    expect(entries[0].timestamp).toBeTruthy();
  });
});

describe('getLogger / getAllLogEntries', () => {
  it('returns the same logger instance for a category', () => {
    const a = getLogger('search');
    const b = getLogger('search');
    expect(a).toBe(b);
  });

  it('aggregates entries across categories', () => {
    getLogger('search').info('search msg');
    getLogger('sync').warn('sync msg');
    getLogger('auth').error('auth msg');

    const all = getAllLogEntries();
    expect(all.length).toBe(3);
  });
});
