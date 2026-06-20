/**
 * Phase 38 -- Redacted structured logger.
 *
 * Provides debug/info/warn/error logging that automatically strips PII
 * (account names, query text, content, tokens, URLs with user paths)
 * before storing entries in a bounded ring buffer.
 *
 * PRIVACY: No private data is ever stored. All redaction happens at
 * write time so the buffer is always safe to export.
 */

import type { DiagnosticCategory, LogLevel, RedactedLog } from './types';

/** Maximum number of entries retained in the ring buffer. */
const MAX_BUFFER_SIZE = 500;

/** Patterns that indicate private data needing redaction. */
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // OAuth/bearer tokens (must come before generic token pattern)
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replacement: 'Bearer [REDACTED]' },
  // URLs with user paths (must come before generic token pattern)
  { pattern: /https?:\/\/[^\s]+\/(users|accounts|@)[^\s]*/gi, replacement: '[REDACTED_URL]' },
  // @user@instance Mastodon handles (must come before email pattern)
  { pattern: /@[a-zA-Z0-9_]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '@[REDACTED_HANDLE]' },
  // Email addresses
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[REDACTED_EMAIL]' },
  // Query parameters that may contain search text
  { pattern: /([?&])(q|query|search|text)=[^\s&]*/gi, replacement: '$1$2=[REDACTED_QUERY]' },
  // Generic token-like strings (hex or base64, 20+ chars) -- last, as it's most aggressive
  { pattern: /\b[A-Za-z0-9\-._~+/]{20,}={0,2}\b/g, replacement: '[REDACTED_TOKEN]' },
];

/** Fields in metadata that should always be redacted. */
const SENSITIVE_METADATA_KEYS = new Set([
  'query',
  'search_query',
  'content',
  'body',
  'token',
  'access_token',
  'refresh_token',
  'password',
  'secret',
  'authorization',
  'account_name',
  'username',
  'email',
  'display_name',
]);

let idCounter = 0;

function generateId(): string {
  idCounter += 1;
  return `log_${Date.now()}_${idCounter}`;
}

/**
 * Redact PII from a string message.
 */
export function redactMessage(message: string): string {
  let result = message;
  for (const { pattern, replacement } of PII_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Redact sensitive fields from a metadata object.
 */
export function redactMetadata(
  metadata: Record<string, string | number | boolean> | undefined
): Record<string, string | number | boolean> | undefined {
  if (!metadata) return undefined;

  const redacted: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_METADATA_KEYS.has(key.toLowerCase())) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      redacted[key] = redactMessage(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Ring buffer implementation for log storage.
 */
class RingBuffer<T> {
  private buffer: T[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(item: T): void {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift();
    }
    this.buffer.push(item);
  }

  getAll(): T[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
  }

  get size(): number {
    return this.buffer.length;
  }
}

/**
 * RedactedLogger -- structured logger that strips PII before storage.
 */
export class RedactedLogger {
  private readonly buffer: RingBuffer<RedactedLog>;
  private readonly category: DiagnosticCategory;

  constructor(category: DiagnosticCategory, maxSize = MAX_BUFFER_SIZE) {
    this.buffer = new RingBuffer<RedactedLog>(maxSize);
    this.category = category;
  }

  debug(message: string, metadata?: Record<string, string | number | boolean>): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: Record<string, string | number | boolean>): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, string | number | boolean>): void {
    this.log('warn', message, metadata);
  }

  error(message: string, metadata?: Record<string, string | number | boolean>): void {
    this.log('error', message, metadata);
  }

  /**
   * Get all stored log entries (already redacted).
   */
  getEntries(): RedactedLog[] {
    return this.buffer.getAll();
  }

  /**
   * Get the number of stored entries.
   */
  get size(): number {
    return this.buffer.size;
  }

  /**
   * Clear all stored entries.
   */
  clear(): void {
    this.buffer.clear();
  }

  private log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, string | number | boolean>
  ): void {
    const entry: RedactedLog = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      level,
      category: this.category,
      message: redactMessage(message),
      metadata: redactMetadata(metadata),
    };
    this.buffer.push(entry);
  }
}

// -- Shared logger instances per category --

const loggers = new Map<DiagnosticCategory, RedactedLogger>();

/**
 * Get or create a logger for the given category.
 */
export function getLogger(category: DiagnosticCategory): RedactedLogger {
  let logger = loggers.get(category);
  if (!logger) {
    logger = new RedactedLogger(category);
    loggers.set(category, logger);
  }
  return logger;
}

/**
 * Get all log entries across all categories (for export).
 */
export function getAllLogEntries(): RedactedLog[] {
  const entries: RedactedLog[] = [];
  for (const logger of loggers.values()) {
    entries.push(...logger.getEntries());
  }
  // Sort by timestamp ascending
  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return entries;
}

/**
 * Reset all loggers (for testing).
 */
export function resetAllLoggers(): void {
  for (const logger of loggers.values()) {
    logger.clear();
  }
  loggers.clear();
  idCounter = 0;
}
