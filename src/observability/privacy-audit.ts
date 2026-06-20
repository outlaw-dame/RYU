/**
 * Phase 38 -- Privacy audit.
 *
 * Validates that a diagnostic export or health document contains no
 * private data (tokens, email addresses, user handles, query text,
 * content bodies, or other PII).
 *
 * This is the last line of defense before data leaves the device.
 */

import type { HealthExport, DiagnosticReport } from './types';

/** Patterns that should NEVER appear in an export. */
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, description: 'Bearer token' },
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, description: 'Email address' },
  { pattern: /@[a-zA-Z0-9_]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, description: 'Mastodon handle' },
  {
    pattern: /https?:\/\/[^\s"]+\/(users|accounts|@)[^\s"]*/gi,
    description: 'URL with user path',
  },
  // Long token-like strings (base64/hex, 32+ chars as stricter threshold for audit)
  {
    pattern: /\b[A-Za-z0-9\-._~+/]{32,}={0,2}\b/g,
    description: 'Possible token or secret',
  },
];

/** Keys whose values must never contain non-redacted content. */
const SENSITIVE_KEYS = new Set([
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

/** Result of a privacy audit scan. */
export interface PrivacyAuditResult {
  /** Whether the audit passed (no PII found). */
  passed: boolean;
  /** List of violations found. */
  violations: PrivacyViolation[];
}

/** A single privacy violation detected during audit. */
export interface PrivacyViolation {
  /** JSON path or description of where the violation was found. */
  path: string;
  /** Type of violation. */
  description: string;
  /** The matched fragment (truncated for safety). */
  fragment: string;
}

/**
 * Deep-scan a value for PII patterns.
 */
function scanValue(value: unknown, path: string, violations: PrivacyViolation[]): void {
  if (value === null || value === undefined) return;

  if (typeof value === 'string') {
    // Skip known redaction placeholders
    if (value === '[REDACTED]' || value === '[REDACTED_TOKEN]' ||
        value === '[REDACTED_EMAIL]' || value === '[REDACTED_URL]' ||
        value === 'Bearer [REDACTED]' || value === '@[REDACTED_HANDLE]') {
      return;
    }

    for (const { pattern, description } of FORBIDDEN_PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(value);
      if (match) {
        violations.push({
          path,
          description,
          fragment: match[0].slice(0, 20) + (match[0].length > 20 ? '...' : ''),
        });
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      scanValue(value[i], `${path}[${i}]`, violations);
    }
    return;
  }

  if (typeof value === 'object') {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      // Check if a sensitive key has a non-redacted string value
      if (SENSITIVE_KEYS.has(key.toLowerCase()) && typeof v === 'string' && !v.startsWith('[REDACTED')) {
        violations.push({
          path: `${path}.${key}`,
          description: `Sensitive key "${key}" contains non-redacted value`,
          fragment: (v as string).slice(0, 20) + ((v as string).length > 20 ? '...' : ''),
        });
      }
      scanValue(v, `${path}.${key}`, violations);
    }
  }
}

/**
 * Run a privacy audit against a health export document.
 *
 * Returns a result indicating whether the document is safe for export.
 * This should be called before any data leaves the device.
 */
export function auditPrivacy(doc: HealthExport | DiagnosticReport): PrivacyAuditResult {
  const violations: PrivacyViolation[] = [];
  scanValue(doc, 'root', violations);
  return {
    passed: violations.length === 0,
    violations,
  };
}
