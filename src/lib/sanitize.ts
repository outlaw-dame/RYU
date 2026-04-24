import DOMPurify from "dompurify";

const forbiddenSchemes = /^(?:javascript|data|vbscript):/i;

export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed || forbiddenSchemes.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function sanitizeUserHtml(html: string) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "a", "strong", "em", "b", "i", "ul", "ol", "li", "blockquote", "code", "pre", "span"],
    ALLOWED_ATTR: ["href", "title", "rel", "target", "class"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
    ALLOW_DATA_ATTR: false
  });
}

export function stripHtml(html: string) {
  const div = document.createElement("div");
  div.innerHTML = sanitizeUserHtml(html);
  return div.textContent?.trim() ?? "";
}
