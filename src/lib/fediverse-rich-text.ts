import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import twemoji from "twemoji";
import { parse as parseMfm } from "mfm-js";
import { sanitizeUrl } from "./sanitize";

type RenderOptions = {
  instanceOrigin?: string | null;
  customEmoji?: Map<string, string>;
};

const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: false
}).disable(["image"]);

const mfmNodeRenderers: Record<string, (node: Record<string, unknown>, options: RenderOptions) => string> = {
  text: (node) => escapeHtml(String((node.props as Record<string, unknown> | undefined)?.text ?? "")),
  bold: (node, options) => `<strong>${renderMfmChildren(node, options)}</strong>`,
  italic: (node, options) => `<em>${renderMfmChildren(node, options)}</em>`,
  strike: (node, options) => `<del>${renderMfmChildren(node, options)}</del>`,
  small: (node, options) => `<small>${renderMfmChildren(node, options)}</small>`,
  quote: (node, options) => `<blockquote>${renderMfmChildren(node, options)}</blockquote>`,
  inlineCode: (node) => `<code>${escapeHtml(String((node.props as Record<string, unknown> | undefined)?.code ?? ""))}</code>`,
  codeBlock: (node) => `<pre><code>${escapeHtml(String((node.props as Record<string, unknown> | undefined)?.code ?? ""))}</code></pre>`,
  center: (node, options) => `<p style="text-align:center">${renderMfmChildren(node, options)}</p>`,
  link: (node, options) => {
    const props = (node.props as Record<string, unknown> | undefined) ?? {};
    const href = sanitizeUrl(typeof props.url === "string" ? props.url : null);
    const label = renderMfmChildren(node, options) || escapeHtml(String(props.url ?? ""));
    return href
      ? `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : label;
  },
  hashtag: (node, options) => {
    const props = (node.props as Record<string, unknown> | undefined) ?? {};
    const rawTag = String(props.hashtag ?? "").replace(/^#/, "").trim();
    if (!rawTag) return "";
    const href = hashtagHref(rawTag, options.instanceOrigin);
    const label = `#${escapeHtml(rawTag)}`;
    return href
      ? `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : label;
  },
  mention: (node) => {
    const props = (node.props as Record<string, unknown> | undefined) ?? {};
    const acct = String(props.acct ?? "").trim();
    const username = String(props.username ?? "").trim();
    const host = String(props.host ?? "").trim();
    const label = escapeHtml(acct || (username ? `@${username}` : ""));
    if (!label) return "";

    if (username && host) {
      const href = sanitizeUrl(`https://${host}/@${username}`);
      if (href) return `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }

    return label;
  },
  emojiCode: (node, options) => {
    const props = (node.props as Record<string, unknown> | undefined) ?? {};
    const shortcode = String(props.name ?? "").trim().toLowerCase();
    if (!shortcode) return "";

    const src = options.customEmoji?.get(shortcode);
    if (!src) {
      return `:${escapeHtml(shortcode)}:`;
    }

    return `<img class="mfm-emoji" src="${escapeAttribute(src)}" alt=":${escapeAttribute(shortcode)}:" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`;
  },
  uniEmoji: (node) => escapeHtml(String((node.props as Record<string, unknown> | undefined)?.emoji ?? "")),
  fn: (node, options) => renderMfmChildren(node, options)
};

function renderMfmChildren(node: Record<string, unknown>, options: RenderOptions): string {
  const children = Array.isArray(node.children) ? node.children : [];
  return children.map((child) => renderMfmNode(asRecord(child), options)).join("");
}

function renderMfmNode(node: Record<string, unknown> | null, options: RenderOptions): string {
  if (!node) return "";
  const type = typeof node.type === "string" ? node.type : "text";
  const renderer = mfmNodeRenderers[type];
  if (renderer) return renderer(node, options);
  return renderMfmChildren(node, options);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function hashtagHref(tag: string, instanceOrigin?: string | null): string | null {
  const base = sanitizeUrl(instanceOrigin ?? null) ?? "https://mastodon.social";
  return sanitizeUrl(`${base.replace(/\/$/, "")}/tags/${encodeURIComponent(tag)}`);
}

function preprocessPlainTextForMarkdown(input: string, instanceOrigin?: string | null): string {
  return input.replace(/(^|[\s(>])#([\p{L}\p{N}_]{2,64})/gu, (_all, prefix: string, tag: string) => {
    const href = hashtagHref(tag, instanceOrigin);
    if (!href) return `${prefix}#${tag}`;
    return `${prefix}[#${tag}](${href})`;
  });
}

function sanitizeRichHtml(inputHtml: string): string {
  const safeHtml = DOMPurify.sanitize(inputHtml, {
    ALLOWED_TAGS: ["p", "br", "a", "strong", "em", "b", "i", "ul", "ol", "li", "blockquote", "code", "pre", "span", "small", "del", "img"],
    ALLOWED_ATTR: ["href", "title", "rel", "target", "class", "src", "alt", "loading", "decoding", "referrerpolicy"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
    ALLOW_DATA_ATTR: false
  });

  const container = document.createElement("div");
  container.innerHTML = safeHtml;

  for (const link of Array.from(container.querySelectorAll("a"))) {
    const href = sanitizeUrl(link.getAttribute("href"));
    if (!href) {
      const replacement = document.createTextNode(link.textContent ?? "");
      link.replaceWith(replacement);
      continue;
    }

    link.setAttribute("href", href);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  }

  for (const img of Array.from(container.querySelectorAll("img"))) {
    const cls = img.getAttribute("class") ?? "";
    const isEmoji = cls.includes("twemoji") || cls.includes("mfm-emoji");
    const src = sanitizeUrl(img.getAttribute("src"));
    if (!isEmoji || !src) {
      img.remove();
      continue;
    }

    img.setAttribute("src", src);
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
    img.setAttribute("referrerpolicy", "no-referrer");
  }

  return container.innerHTML;
}

function renderMfm(input: string, options: RenderOptions): string {
  try {
    const ast = parseMfm(input) as unknown[];
    const html = ast.map((node) => renderMfmNode(asRecord(node), options)).join("");
    return html.includes("<") ? `<p>${html}</p>` : escapeHtml(input);
  } catch {
    return escapeHtml(input);
  }
}

function formattingScore(html: string): number {
  const matches = html.match(/<(strong|em|code|pre|blockquote|ul|ol|li|a|del|small)\b/gi);
  return matches?.length ?? 0;
}

export function renderFediverseRichText(rawInput: string, options: RenderOptions = {}): { html: string; plainText: string } {
  const input = rawInput.trim();
  if (!input) {
    return { html: "", plainText: "" };
  }

  const seemsHtml = /<\/?[a-z][^>]*>/i.test(input);

  let htmlCandidate = "";

  if (seemsHtml) {
    htmlCandidate = input;
  } else {
    const preprocessed = preprocessPlainTextForMarkdown(input, options.instanceOrigin);
    const markdownHtml = markdown.render(preprocessed);
    const mfmHtml = renderMfm(input, options);
    htmlCandidate = formattingScore(mfmHtml) >= formattingScore(markdownHtml) ? mfmHtml : markdownHtml;
  }

  const emojiHtml = twemoji.parse(htmlCandidate, {
    className: "twemoji",
    base: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/",
    folder: "svg",
    ext: ".svg"
  });

  const safeHtml = sanitizeRichHtml(emojiHtml);
  const textContainer = document.createElement("div");
  textContainer.innerHTML = safeHtml;

  return {
    html: safeHtml,
    plainText: textContainer.textContent?.replace(/\s+/g, " ").trim() ?? ""
  };
}
