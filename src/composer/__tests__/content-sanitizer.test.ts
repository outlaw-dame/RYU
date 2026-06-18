import { describe, it, expect } from 'vitest';
import {
  stripDangerousHtml,
  escapeHtml,
  normalizeWhitespace,
  sanitizeContent,
  getMaxLength,
  validateContent
} from '../content-sanitizer';
import { COMPOSER_LIMITS } from '../types';

describe('content-sanitizer', () => {
  describe('stripDangerousHtml', () => {
    it('removes script tags', () => {
      expect(stripDangerousHtml('hello <script>alert("xss")</script> world'))
        .toBe('hello alert("xss") world');
    });

    it('removes iframe tags', () => {
      expect(stripDangerousHtml('test <iframe src="bad"></iframe> end'))
        .toBe('test  end');
    });

    it('removes event handlers', () => {
      expect(stripDangerousHtml('<div onclick="bad()">text</div>'))
        .toBe('<div>text</div>');
    });

    it('removes javascript: URLs', () => {
      expect(stripDangerousHtml('<a href="javascript:alert(1)">click</a>'))
        .toBe('<a >click</a>');
    });

    it('preserves safe HTML', () => {
      expect(stripDangerousHtml('<p>Hello <strong>world</strong></p>'))
        .toBe('<p>Hello <strong>world</strong></p>');
    });

    it('handles empty input', () => {
      expect(stripDangerousHtml('')).toBe('');
    });
  });

  describe('escapeHtml', () => {
    it('escapes angle brackets', () => {
      expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
    });

    it('escapes ampersands', () => {
      expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    it('escapes quotes', () => {
      expect(escapeHtml('"hello" \'world\'')).toBe('&quot;hello&quot; &#x27;world&#x27;');
    });
  });

  describe('normalizeWhitespace', () => {
    it('trims leading and trailing whitespace', () => {
      expect(normalizeWhitespace('  hello  ')).toBe('hello');
    });

    it('collapses 3+ newlines to 2', () => {
      expect(normalizeWhitespace('a\n\n\n\nb')).toBe('a\n\nb');
    });

    it('removes zero-width characters', () => {
      expect(normalizeWhitespace('he\u200Bllo')).toBe('hello');
      expect(normalizeWhitespace('wo\uFEFFrld')).toBe('world');
    });

    it('preserves double newlines', () => {
      expect(normalizeWhitespace('a\n\nb')).toBe('a\n\nb');
    });
  });

  describe('sanitizeContent', () => {
    it('applies all sanitization in order', () => {
      const input = '  <script>bad</script> Hello\n\n\n\nWorld  ';
      const result = sanitizeContent(input);
      expect(result).toBe('bad Hello\n\nWorld');
    });
  });

  describe('getMaxLength', () => {
    it('returns 500 for status mode', () => {
      expect(getMaxLength('status')).toBe(500);
    });

    it('returns 500 for reply mode', () => {
      expect(getMaxLength('reply')).toBe(500);
    });

    it('returns 5000 for review mode', () => {
      expect(getMaxLength('review')).toBe(5000);
    });
  });

  describe('validateContent', () => {
    it('returns valid for proper status', () => {
      const result = validateContent({
        mode: 'status',
        text: 'Hello world',
        title: '',
        contentWarning: { enabled: false, text: '' },
        attachmentCount: 0
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects empty text', () => {
      const result = validateContent({
        mode: 'status',
        text: '   ',
        title: '',
        contentWarning: { enabled: false, text: '' },
        attachmentCount: 0
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('text');
      expect(result.errors[0].messageKey).toBe('composer.errors.textRequired');
    });

    it('rejects text over limit', () => {
      const result = validateContent({
        mode: 'status',
        text: 'a'.repeat(COMPOSER_LIMITS.STATUS_MAX_LENGTH + 1),
        title: '',
        contentWarning: { enabled: false, text: '' },
        attachmentCount: 0
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].messageKey).toBe('composer.errors.textTooLong');
    });

    it('rejects title over limit in review mode', () => {
      const result = validateContent({
        mode: 'review',
        text: 'Good content',
        title: 'a'.repeat(COMPOSER_LIMITS.TITLE_MAX_LENGTH + 1),
        contentWarning: { enabled: false, text: '' },
        attachmentCount: 0
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].messageKey).toBe('composer.errors.titleTooLong');
    });

    it('allows long title in status mode (title not checked)', () => {
      const result = validateContent({
        mode: 'status',
        text: 'Good content',
        title: 'a'.repeat(COMPOSER_LIMITS.TITLE_MAX_LENGTH + 1),
        contentWarning: { enabled: false, text: '' },
        attachmentCount: 0
      });
      expect(result.valid).toBe(true);
    });

    it('rejects empty CW text when CW is enabled', () => {
      const result = validateContent({
        mode: 'status',
        text: 'Test',
        title: '',
        contentWarning: { enabled: true, text: '   ' },
        attachmentCount: 0
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].messageKey).toBe('composer.errors.cwRequired');
    });

    it('rejects too many attachments', () => {
      const result = validateContent({
        mode: 'status',
        text: 'Test',
        title: '',
        contentWarning: { enabled: false, text: '' },
        attachmentCount: 5
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].messageKey).toBe('composer.errors.tooManyAttachments');
    });
  });
});
