import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { AppTabBar, type TabId } from "../components/layout/AppTabBar";
import { ErrorBoundary } from "../components/common/ErrorBoundary";
import { OfflineIndicator } from "../components/common/OfflineIndicator";
import { EmptyState } from "../components/common/EmptyState";
import { CoverGrid } from "../components/common/CoverGrid";
import { SectionHeader } from "../components/common/SectionHeader";
import { Skeleton, SkeletonCoverGrid } from "../components/common/Skeleton";
import { useDatabase } from "../hooks/useDatabase";
import { useImportedBooks } from "../hooks/useImportedBooks";
import { normalizeSearchQuery } from "../search/query-normalize";
import { scheduleSearchIndexHealthCheck } from "../search/index-lifecycle";
import { scheduleSearchIndexDependencyHealthCheck } from "../search/search-index-dependency-lifecycle";
import type { GroupedSearchResults } from "../search/group";
import type { RankedSearchResult } from "../search/types";
import type { SearchExplanation } from "../search/explain";
import { discoverMastodonOAuth, normalizeInstanceOrigin } from "../auth/instance";
import { buildAuthorizeUrl, createPendingAuthTransaction } from "../auth/oauth";
import { clearPendingAuthTransaction, loadPendingAuthTransaction, savePendingAuthTransaction } from "../auth/transaction";
import {
  parseMastodonExchangeRequest,
  parseMastodonExchangeResponse,
  parseMastodonRegisterRequest,
  parseMastodonRegisterResponse
} from "../auth/contracts";
import { useInstanceDiscovery } from "../hooks/useInstanceDiscovery";
import { useAutocomplete } from "../hooks/useAutocomplete";
import { useMastodonShelves } from "../hooks/useMastodonShelves";
import { sanitizeUrl, stripHtml } from "../lib/sanitize";
import type { MastodonList, MastodonNotification, MastodonStatus } from "../sync/mastodon-client";
import {
  MastodonSessionApiError,
  parseMastodonNotificationPageResponse,
  parseMastodonStatusPageResponse
} from "../sync/mastodon-session-api";
import { CURATED_BOOKTOK_TRENDS, parseBookTokTrendingPayload, type BookTokTrend } from "../sync/booktok-trending";

const sampleBooks = [
  { id: "1", title: "Kafka on the Shore", author: "Haruki Murakami", coverUrl: "https://covers.openlibrary.org/b/isbn/9781400079278-M.jpg" },
  { id: "2", title: "Dune", author: "Frank Herbert", coverUrl: "https://covers.openlibrary.org/b/isbn/9780441013593-M.jpg" },
  { id: "3", title: "Piranesi", author: "Susanna Clarke", coverUrl: "https://covers.openlibrary.org/b/isbn/9781635575996-M.jpg" },
  { id: "4", title: "Project Hail Mary", author: "Andy Weir", coverUrl: "https://covers.openlibrary.org/b/isbn/9780593135204-M.jpg" },
  { id: "5", title: "The Dispossessed", author: "Ursula K. Le Guin", coverUrl: "https://covers.openlibrary.org/b/isbn/9780061054884-M.jpg" },
  { id: "6", title: "Exhalation", author: "Ted Chiang", coverUrl: "https://covers.openlibrary.org/b/isbn/9781101947883-M.jpg" }
];

type ExplainedSearchResult = RankedSearchResult & { explanation?: SearchExplanation };
type ExplainedGroupedResults = GroupedSearchResults<ExplainedSearchResult>;

const DEFAULT_MASTODON_REGISTER_ENDPOINT = "/api/auth/mastodon/register";
const DEFAULT_MASTODON_EXCHANGE_ENDPOINT = "/api/auth/mastodon/exchange";
const DEFAULT_MASTODON_SESSION_ENDPOINT = "/api/auth/mastodon/session";
const DEFAULT_MASTODON_REVOKE_ENDPOINT = "/api/auth/mastodon/revoke";
const DEFAULT_MASTODON_HOME_TIMELINE_ENDPOINT = "/api/auth/mastodon/timelines/home";
const DEFAULT_MASTODON_NOTIFICATIONS_ENDPOINT = "/api/auth/mastodon/notifications";
const DEFAULT_NOW_READING_ENDPOINT = "/api/trends/now-reading";
const DEFAULT_BOOKTOK_TRENDING_ENDPOINT = "/api/trends/booktok";

function getOAuthRedirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

const INSTANCE_DATALIST_ID = "instance-suggestion-list";
const IMPORT_URL_DATALIST_ID = "import-url-suggestion-list";
const SEARCH_AUTOCOMPLETE_LIST_ID = "search-autocomplete-list";
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function computeClientBackoffMs(attempt: number, baseMs = 200, capMs = 1800): number {
  const jitter = Math.floor(Math.random() * 120);
  return Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1) + jitter);
}

async function fetchWithBackoff(url: string, init: RequestInit, attempts = 3, timeoutMs = 12_000): Promise<Response> {
  let lastError: Error | null = null;
  const { signal: externalSignal, ...initWithoutSignal } = init;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    if (externalSignal?.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });
    }

    try {
      const response = await fetch(url, {
        ...initWithoutSignal,
        signal: controller.signal
      });
      window.clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", abortFromExternalSignal);

      if (response.ok) {
        return response;
      }

      if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < attempts) {
        await new Promise((resolve) => window.setTimeout(resolve, computeClientBackoffMs(attempt)));
        continue;
      }

      return response;
    } catch (error) {
      window.clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", abortFromExternalSignal);
      if (externalSignal?.aborted) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts) {
        await new Promise((resolve) => window.setTimeout(resolve, computeClientBackoffMs(attempt)));
      }
    }
  }

  throw lastError ?? new Error("Network request failed");
}

type SearchRuntime = {
  searchAll: (query: string, options: { context: { surface: "global" } }) => Promise<unknown>;
  classifyQueryIntent: typeof import("../search/intent").classifyQueryIntent;
  getAdaptiveAlpha: typeof import("../search/weights").getAdaptiveAlpha;
  recordClick: typeof import("../search/feedback").recordClick;
};

type ImportRuntime = {
  getRxDBActivityPubStore: typeof import("../db/activitypub-ingest").getRxDBActivityPubStore;
  ActivityPubResolver: typeof import("../sync/resolver").ActivityPubResolver;
};

let searchRuntimePromise: Promise<SearchRuntime> | null = null;
let importRuntimePromise: Promise<ImportRuntime> | null = null;

function loadSearchRuntime(): Promise<SearchRuntime> {
  if (!searchRuntimePromise) {
    searchRuntimePromise = Promise.all([
      import("../search/search"),
      import("../search/intent"),
      import("../search/weights"),
      import("../search/feedback")
    ]).then(([searchModule, intentModule, weightsModule, feedbackModule]) => ({
      searchAll: searchModule.searchAll,
      classifyQueryIntent: intentModule.classifyQueryIntent,
      getAdaptiveAlpha: weightsModule.getAdaptiveAlpha,
      recordClick: feedbackModule.recordClick
    }));
  }

  return searchRuntimePromise;
}

function loadImportRuntime(): Promise<ImportRuntime> {
  if (!importRuntimePromise) {
    importRuntimePromise = Promise.all([
      import("../db/activitypub-ingest"),
      import("../sync/resolver")
    ]).then(([ingestModule, resolverModule]) => ({
      getRxDBActivityPubStore: ingestModule.getRxDBActivityPubStore,
      ActivityPubResolver: resolverModule.ActivityPubResolver
    }));
  }

  return importRuntimePromise;
}

function TabPanel({ id, activeTab, children }: { id: TabId; activeTab: TabId; children: React.ReactNode }) {
  return (
    <motion.section
      key={id}
      id={`panel-${id}`}
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      hidden={activeTab !== id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18 }}
      className="scroll-container"
      style={{
        height: "100%",
        paddingTop: "var(--safe-top)",
        paddingBottom: "calc(var(--space-8) + var(--safe-bottom))"
      }}
    >
      {children}
    </motion.section>
  );
}

function ScreenTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <header style={{ padding: "0 var(--space-4) var(--space-6)" }}>
      {eyebrow ? (
        <div style={{
          fontSize: "var(--text-subhead)",
          lineHeight: "var(--leading-subhead)",
          letterSpacing: "var(--tracking-subhead)",
          color: "var(--color-text-tertiary)",
          marginBottom: "var(--space-1)"
        }}>{eyebrow}</div>
      ) : null}
      <h1 style={{
        margin: 0,
        fontFamily: "var(--font-display)",
        fontSize: "var(--text-large-title)",
        lineHeight: "var(--leading-large-title)",
        letterSpacing: "var(--tracking-large-title)",
        fontWeight: 700,
        color: "var(--color-text)"
      }}>{title}</h1>
    </header>
  );
}

function SearchResultRow({
  result,
  query,
  onSelect
}: {
  result: ExplainedSearchResult;
  query: string;
  onSelect: (result: ExplainedSearchResult) => void;
}) {
  const select = () => onSelect(result);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      }}
      style={{
        width: "100%",
        textAlign: "left",
        borderRadius: "var(--radius-lg)",
        background: "var(--color-bg-secondary)",
        color: "var(--color-text)",
        padding: "var(--space-4)",
        boxShadow: "var(--shadow-card)",
        display: "grid",
        gap: "var(--space-2)",
        cursor: "pointer",
        outlineOffset: "3px"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <strong style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-headline)" }}>{result.title}</strong>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)", textTransform: "uppercase" }}>{result.type}</span>
      </div>
      {result.authorText ? <div style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-subhead)" }}>{result.authorText}</div> : null}
      {result.description ? <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)", lineHeight: 1.35 }}>{result.description.slice(0, 180)}</p> : null}
      {import.meta.env.DEV && result.explanation ? (
        <details onClick={(event) => event.stopPropagation()} style={{ fontSize: "var(--text-caption1)", color: "var(--color-text-tertiary)" }}>
          <summary>Why this result?</summary>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: "var(--space-2) 0 0" }}>
            {JSON.stringify({
              query,
              score: result.score,
              reasons: result.explanation.reasons,
              intent: result.explanation.intent.intent,
              alpha: result.explanation.appliedAlpha,
              stages: result.explanation.stages
            }, null, 2)}
          </pre>
        </details>
      ) : null}
    </article>
  );
}

function SearchResultsSection({
  title,
  query,
  results,
  onSelect
}: {
  title: string;
  query: string;
  results: ExplainedSearchResult[];
  onSelect: (result: ExplainedSearchResult) => void;
}) {
  if (!results.length) return null;

  return (
    <section style={{ display: "grid", gap: "var(--space-3)" }}>
      <SectionHeader title={title} />
      <div style={{ display: "grid", gap: "var(--space-3)", padding: "0 var(--space-4)" }}>
        {results.map((result) => (
          <SearchResultRow key={result.id} result={result} query={query} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

function formatActivityDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function mastodonAccountLabel(account: MastodonStatus["account"]): string {
  return account.display_name || account.acct || account.username || "Unknown account";
}

function mastodonStatusText(status: MastodonStatus): string {
  const normalizedHtml = (status.content ?? "")
    .replace(/<span[^>]*class="[^"]*invisible[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|blockquote|h[1-6])>/gi, "\n");
  const text = stripHtml(normalizedHtml)
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (text) return text;
  if (status.spoiler_text) return status.spoiler_text;
  return "Updated their reading activity.";
}

function accountInitials(account: MastodonStatus["account"]): string {
  const label = mastodonAccountLabel(account).replace(/^@/, "").trim();
  const initials = label
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "RY";
}

type NowReadingImportedBook = {
  id: string;
  title: string;
  author?: string;
  coverUrl?: string;
  sourceUrl?: string;
};

type InAppReaderProfile = {
  displayName: string;
  username: string;
  avatarSrc: string | null;
  bio: string | null;
  featuredHashtags: string[];
  recentTitles: string[];
  externalProfileUrl: string | null;
  originLabel: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

function statusCardData(status: MastodonStatus): {
  title: string | null;
  authorName: string | null;
  url: string | null;
  image: string | null;
} {
  const card = asRecord((status as unknown as Record<string, unknown>).card);
  if (!card) {
    return { title: null, authorName: null, url: null, image: null };
  }

  return {
    title: typeof card.title === "string" && card.title.trim() ? card.title.trim() : null,
    authorName: typeof card.author_name === "string" && card.author_name.trim() ? card.author_name.trim() : null,
    url: typeof card.url === "string" ? sanitizeUrl(card.url) : null,
    image: typeof card.image === "string" ? sanitizeUrl(card.image) : null
  };
}

function statusMediaCover(status: MastodonStatus): string | null {
  const record = status as unknown as Record<string, unknown>;
  const media = Array.isArray(record.media_attachments) ? record.media_attachments : [];

  for (const item of media) {
    const mediaRecord = asRecord(item);
    if (!mediaRecord) {
      continue;
    }

    const mediaType = typeof mediaRecord.type === "string" ? mediaRecord.type : "";
    if (mediaType && mediaType !== "image") {
      continue;
    }

    const mediaUrl = typeof mediaRecord.preview_url === "string"
      ? sanitizeUrl(mediaRecord.preview_url)
      : typeof mediaRecord.url === "string"
        ? sanitizeUrl(mediaRecord.url)
        : null;

    if (mediaUrl) {
      return mediaUrl;
    }
  }

  return null;
}

function normalizeLookupText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractBookTitleFromText(text: string): string | null {
  const fromReadingPhrase = text.match(/(?:currently|now|am)?\s*reading\s+(["“][^"”]+["”]|[^.!?\n#]{3,90})/i);
  if (fromReadingPhrase?.[1]) {
    return fromReadingPhrase[1].replace(/["“”]/g, "").trim();
  }

  const quoted = text.match(/["“]([^"”]{2,110})["”]/);
  if (quoted?.[1]) {
    return quoted[1].trim();
  }

  return null;
}

function statusBookTitle(status: MastodonStatus): string {
  const card = statusCardData(status);
  if (card.title) {
    return card.title;
  }

  const text = mastodonStatusText(status);
  const extracted = extractBookTitleFromText(text);
  if (extracted) {
    return extracted;
  }

  return "Reading update";
}

function statusCreatorLabel(status: MastodonStatus): string | null {
  const card = statusCardData(status);
  if (card.authorName) {
    return `Creator: ${card.authorName}`;
  }

  const accountFields: unknown[] = Array.isArray((status.account as unknown as Record<string, unknown>).fields)
    ? (status.account as unknown as Record<string, unknown>).fields as unknown[]
    : [];

  for (const field of accountFields) {
    const fieldRecord = asRecord(field);
    if (!fieldRecord) {
      continue;
    }

    const name = typeof fieldRecord.name === "string" ? fieldRecord.name.toLowerCase().trim() : "";
    if (name !== "creator") {
      continue;
    }

    const value = typeof fieldRecord.value === "string" ? stripHtml(fieldRecord.value).trim() : "";
    if (value) {
      return `Creator: ${value}`;
    }
  }

  return null;
}

function resolveCoverProxySrc(rawUrl: string | null | undefined): string | null {
  const safeUrl = sanitizeUrl(rawUrl);
  if (!safeUrl) {
    return null;
  }

  const parsed = new URL(safeUrl, window.location.origin);
  if (parsed.origin === window.location.origin) {
    return parsed.toString();
  }

  if (parsed.protocol !== "https:") {
    return null;
  }

  return parsed.toString();
}

function retryImageViaProxy(event: React.SyntheticEvent<HTMLImageElement>): void {
  const element = event.currentTarget;
  const alreadyRetried = element.dataset.proxyRetry === "1";
  if (alreadyRetried) {
    element.style.display = "none";
    return;
  }

  const currentSrc = element.getAttribute("src");
  const safeSrc = sanitizeUrl(currentSrc);
  if (!safeSrc) {
    element.style.display = "none";
    return;
  }

  const parsed = new URL(safeSrc, window.location.origin);
  if (parsed.origin === window.location.origin || parsed.protocol !== "https:") {
    element.style.display = "none";
    return;
  }

  element.dataset.proxyRetry = "1";
  element.src = `/api/media/cover?url=${encodeURIComponent(parsed.toString())}`;
}

function accountBio(account: MastodonStatus["account"]): string | null {
  const record = account as unknown as Record<string, unknown>;
  const note = typeof record.note === "string" ? stripHtml(record.note).trim() : "";
  if (note) {
    return note;
  }

  const summary = typeof record.summary === "string" ? stripHtml(record.summary).trim() : "";
  return summary || null;
}

function statusHashtags(status: MastodonStatus): string[] {
  const record = status as unknown as Record<string, unknown>;
  const rawTags = Array.isArray(record.tags) ? record.tags as unknown[] : [];

  return rawTags
    .map((tag) => {
      const tagRecord = asRecord(tag);
      if (!tagRecord || typeof tagRecord.name !== "string") {
        return null;
      }

      const name = tagRecord.name.trim().replace(/^#/, "");
      return name ? name.toLowerCase() : null;
    })
    .filter((value): value is string => Boolean(value));
}

function statusAccountKey(status: MastodonStatus): string {
  return (status.account.acct || status.account.id || status.account.username || "unknown").toLowerCase();
}

function buildReaderProfileFromStatus(status: MastodonStatus, allStatuses: MastodonStatus[]): InAppReaderProfile {
  const account = status.account;
  const accountKey = statusAccountKey(status);
  const related = allStatuses.filter((item) => statusAccountKey(item) === accountKey);
  const hashtagScores = new Map<string, number>();

  for (const item of related) {
    for (const tag of statusHashtags(item)) {
      hashtagScores.set(tag, (hashtagScores.get(tag) ?? 0) + 1);
    }
  }

  const featuredHashtags = Array.from(hashtagScores.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([tag]) => `#${tag}`);

  const recentTitles = related
    .map((item) => statusBookTitle(item))
    .filter((title, index, values) => Boolean(title) && values.indexOf(title) === index)
    .slice(0, 4);

  const username = account.acct ? `@${account.acct}` : account.username ? `@${account.username}` : "@reader";
  const displayName = mastodonAccountLabel(account);
  const avatarSrc = resolveCoverProxySrc(account.avatar ?? null);
  const externalProfileUrl = sanitizeUrl(account.url ?? null);
  const originLabel = username.includes("bookwyrm")
    ? "BookWyrm"
    : username.includes("mastodon") || externalProfileUrl?.includes("mastodon")
      ? "Mastodon"
      : "Fediverse";

  return {
    displayName,
    username,
    avatarSrc,
    bio: accountBio(account),
    featuredHashtags,
    recentTitles,
    externalProfileUrl,
    originLabel
  };
}

function matchImportedBookCover(
  title: string,
  importedBooks: NowReadingImportedBook[]
): NowReadingImportedBook | null {
  const normalizedTitle = normalizeLookupText(title);
  if (!normalizedTitle) {
    return null;
  }

  for (const book of importedBooks) {
    if (!book.coverUrl) {
      continue;
    }

    const normalizedBookTitle = normalizeLookupText(book.title);
    if (!normalizedBookTitle) {
      continue;
    }

    if (normalizedBookTitle === normalizedTitle) {
      return book;
    }
  }

  for (const book of importedBooks) {
    if (!book.coverUrl) {
      continue;
    }

    const normalizedBookTitle = normalizeLookupText(book.title);
    if (!normalizedBookTitle) {
      continue;
    }

    if (normalizedBookTitle.includes(normalizedTitle) || normalizedTitle.includes(normalizedBookTitle)) {
      return book;
    }
  }

  return null;
}

function NowReadingStatusGrid({
  statuses,
  importedBooks,
  onOpenProfile,
  onOpenStatus
}: {
  statuses: MastodonStatus[];
  importedBooks: NowReadingImportedBook[];
  onOpenProfile: (status: MastodonStatus) => void;
  onOpenStatus: (status: MastodonStatus) => void;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(88px, 128px))",
        justifyContent: "start",
        alignItems: "start",
        gap: "var(--space-4) var(--space-3)",
        padding: "0 var(--space-4)"
      }}
    >
      {statuses.map((status) => {
        const text = mastodonStatusText(status);
        const account = mastodonAccountLabel(status.account);
        const accountHandle = status.account.acct ? `@${status.account.acct}` : status.account.username ? `@${status.account.username}` : "@reader";
        const avatarSrc = resolveCoverProxySrc(status.account.avatar ?? null);
        const card = statusCardData(status);
        const creatorLabel = statusCreatorLabel(status);
        const bookTitle = statusBookTitle(status);
        const importedCoverMatch = matchImportedBookCover(bookTitle, importedBooks);
        const coverSrc = resolveCoverProxySrc(card.image) ?? resolveCoverProxySrc(statusMediaCover(status)) ?? resolveCoverProxySrc(importedCoverMatch?.coverUrl ?? null);

        return (
          <motion.div
            key={status.id}
            variants={{ hidden: { opacity: 0, y: 8, scale: 0.96 }, show: { opacity: 1, y: 0, scale: 1 } }}
            style={{ display: "grid", gap: "var(--space-2)", width: "100%", minWidth: 0 }}
          >
            <button
              type="button"
              onClick={() => onOpenStatus(status)}
              aria-label={`Open in-app post by ${account}`}
              style={{ border: 0, padding: 0, margin: 0, display: "block", textAlign: "left", background: "transparent", cursor: "pointer" }}
            >
              <div
                style={{
                  position: "relative",
                  display: "grid",
                  gridTemplateRows: coverSrc ? "1fr auto" : "auto auto 1fr",
                  aspectRatio: "2 / 3",
                  borderRadius: "var(--radius-cover)",
                  overflow: "hidden",
                  background: "linear-gradient(145deg, var(--color-bg-secondary), var(--color-bg-tertiary))",
                  boxShadow: "var(--shadow-cover)",
                  padding: "var(--space-2)"
                }}
              >
                {coverSrc ? (
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: 0,
                      backgroundImage: `url(${coverSrc})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      backgroundRepeat: "no-repeat"
                    }}
                  />
                ) : null}
                <div
                  style={{
                    position: "relative",
                    zIndex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "var(--space-2)"
                  }}
                >
                  <span
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "999px",
                      overflow: "hidden",
                      display: "grid",
                      placeItems: "center",
                      fontSize: "var(--text-caption2)",
                      fontWeight: 700,
                      color: "white",
                      background: "color-mix(in srgb, var(--color-text) 26%, transparent)",
                      border: "1px solid color-mix(in srgb, white 50%, transparent)",
                      position: "relative"
                    }}
                  >
                    <span aria-hidden="true">{accountInitials(status.account)}</span>
                    {avatarSrc ? (
                      <img
                        src={avatarSrc}
                        alt={`${account} avatar`}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={(event) => {
                          retryImageViaProxy(event);
                        }}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    ) : null}
                  </span>
                  {creatorLabel ? (
                    <span
                      style={{
                        maxWidth: "70%",
                        borderRadius: "999px",
                        padding: "2px 8px",
                        fontSize: "10px",
                        fontWeight: 700,
                        color: "white",
                        background: "color-mix(in srgb, var(--color-accent) 82%, black 8%)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {creatorLabel}
                    </span>
                  ) : null}
                </div>
                <div style={{ position: "relative", zIndex: 1, marginTop: "var(--space-2)", minHeight: 0 }}>
                  <strong
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      color: coverSrc ? "white" : "var(--color-text)",
                      fontFamily: "var(--font-display)",
                      fontSize: "var(--text-subhead)",
                      lineHeight: "var(--leading-subhead)"
                    }}
                  >
                    {bookTitle}
                  </strong>
                  <p
                    style={{
                      margin: "var(--space-1) 0 0",
                      color: coverSrc ? "rgba(255,255,255,0.92)" : "var(--color-text-secondary)",
                      fontSize: "var(--text-caption1)",
                      lineHeight: "1.3",
                      display: "-webkit-box",
                      WebkitLineClamp: coverSrc ? 2 : 6,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word"
                    }}
                  >
                    {text}
                  </p>
                </div>
                <span
                  style={{
                    position: "relative",
                    zIndex: 1,
                    marginTop: "var(--space-2)",
                    color: coverSrc ? "rgba(255,255,255,0.8)" : "var(--color-text-tertiary)",
                    fontSize: "var(--text-caption2)",
                    fontWeight: 700
                  }}
                >
                  {formatActivityDate(status.created_at)}
                </span>
                {coverSrc ? (
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "linear-gradient(180deg, rgba(6,8,16,0.05) 0%, rgba(6,8,16,0.72) 72%, rgba(6,8,16,0.88) 100%)"
                    }}
                  />
                ) : null}
              </div>
            </button>
            <div>
              <button
                type="button"
                onClick={() => onOpenStatus(status)}
                style={{
                  border: 0,
                  padding: 0,
                  margin: 0,
                  background: "transparent",
                  color: "var(--color-text)",
                  fontSize: "var(--text-footnote)",
                  fontWeight: 600,
                  lineHeight: "var(--leading-footnote)",
                  letterSpacing: "var(--tracking-footnote)",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  overflowWrap: "anywhere",
                  textAlign: "left",
                  cursor: "pointer"
                }}
              >
                {bookTitle}
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: 2, minWidth: 0 }}>
                <span
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "999px",
                    overflow: "hidden",
                    flex: "0 0 auto",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "9px",
                    fontWeight: 700,
                    color: "white",
                    background: "color-mix(in srgb, var(--color-text) 22%, transparent)",
                    position: "relative"
                  }}
                >
                  <span aria-hidden="true">{accountInitials(status.account)}</span>
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={(event) => {
                        retryImageViaProxy(event);
                      }}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenProfile(status)}
                  style={{
                    border: 0,
                    padding: 0,
                    margin: 0,
                    background: "transparent",
                    color: "var(--color-text-tertiary)",
                    fontSize: "var(--text-caption2)",
                    lineHeight: "var(--leading-caption2)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textAlign: "left",
                    cursor: "pointer"
                  }}
                  title={`${account} (${accountHandle})`}
                >
                  {account}
                </button>
              </div>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

function ReaderProfileSheet({
  profile,
  onClose
}: {
  profile: InAppReaderProfile;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${profile.displayName} profile`}
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in srgb, var(--color-bg) 72%, black 28%)",
        display: "grid",
        placeItems: "center",
        padding: "var(--space-4)",
        zIndex: 55
      }}
      onClick={onClose}
    >
      <section
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(680px, 100%)",
          maxHeight: "82dvh",
          overflowY: "auto",
          borderRadius: "var(--radius-xl)",
          background: "var(--color-bg-elevated)",
          boxShadow: "var(--shadow-card)",
          padding: "var(--space-5)",
          display: "grid",
          gap: "var(--space-4)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", minWidth: 0 }}>
            <div
              style={{
                width: "76px",
                height: "76px",
                borderRadius: "999px",
                overflow: "hidden",
                background: "var(--color-bg-secondary)",
                display: "grid",
                placeItems: "center",
                fontSize: "var(--text-title3)",
                fontWeight: 700,
                color: "var(--color-text-secondary)",
                position: "relative"
              }}
            >
              <span aria-hidden="true">{profile.displayName.slice(0, 2).toUpperCase()}</span>
              {profile.avatarSrc ? (
                <img
                  src={profile.avatarSrc}
                  alt={`${profile.displayName} avatar`}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={(event) => {
                    retryImageViaProxy(event);
                  }}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : null}
            </div>
            <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <strong style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-title2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {profile.displayName}
              </strong>
              <span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {profile.username}
              </span>
              <span style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
                {profile.originLabel} profile
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 0, borderRadius: "var(--radius-sm)", background: "var(--color-bg-secondary)", color: "var(--color-text)", minHeight: "36px", padding: "0 var(--space-3)" }}
          >
            Close
          </button>
        </div>

        <section style={{ borderRadius: "var(--radius-md)", background: "var(--color-bg)", padding: "var(--space-4)", display: "grid", gap: "var(--space-2)" }}>
          <strong style={{ fontSize: "var(--text-subhead)" }}>Bio</strong>
          <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)", lineHeight: "var(--leading-footnote)", overflowWrap: "anywhere" }}>
            {profile.bio ?? "No bio provided on this account yet."}
          </p>
        </section>

        <section style={{ borderRadius: "var(--radius-md)", background: "var(--color-bg)", padding: "var(--space-4)", display: "grid", gap: "var(--space-2)" }}>
          <strong style={{ fontSize: "var(--text-subhead)" }}>Featured hashtags</strong>
          {profile.featuredHashtags.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
              {profile.featuredHashtags.map((tag) => (
                <span key={tag} style={{ borderRadius: "999px", padding: "4px 10px", background: "color-mix(in srgb, var(--color-accent) 16%, var(--color-bg))", color: "var(--color-text)", fontSize: "var(--text-caption1)", fontWeight: 700 }}>
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
              No hashtags detected from recent now-reading posts.
            </p>
          )}
        </section>

        {profile.recentTitles.length > 0 ? (
          <section style={{ borderRadius: "var(--radius-md)", background: "var(--color-bg)", padding: "var(--space-4)", display: "grid", gap: "var(--space-2)" }}>
            <strong style={{ fontSize: "var(--text-subhead)" }}>Recent reading mentions</strong>
            <ul style={{ margin: 0, paddingLeft: "var(--space-4)", color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)", display: "grid", gap: "var(--space-1)" }}>
              {profile.recentTitles.map((title) => (
                <li key={title}>{title}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {profile.externalProfileUrl ? (
          <button
            type="button"
            onClick={() => window.open(profile.externalProfileUrl ?? "", "_blank", "noopener,noreferrer")}
            style={{ minHeight: "var(--touch-min)", border: 0, borderRadius: "var(--radius-md)", background: "var(--color-accent)", color: "white", fontWeight: 700 }}
          >
            Open remote profile
          </button>
        ) : null}
      </section>
    </div>
  );
}

function NowReadingPostSheet({
  status,
  importedBooks,
  onClose,
  onOpenProfile
}: {
  status: MastodonStatus;
  importedBooks: NowReadingImportedBook[];
  onClose: () => void;
  onOpenProfile: (status: MastodonStatus) => void;
}) {
  const text = mastodonStatusText(status);
  const card = statusCardData(status);
  const title = statusBookTitle(status);
  const account = mastodonAccountLabel(status.account);
  const accountHandle = status.account.acct ? `@${status.account.acct}` : status.account.username ? `@${status.account.username}` : "@reader";
  const avatarSrc = resolveCoverProxySrc(status.account.avatar ?? null);
  const coverSrc = resolveCoverProxySrc(card.image) ?? resolveCoverProxySrc(statusMediaCover(status)) ?? resolveCoverProxySrc(matchImportedBookCover(title, importedBooks)?.coverUrl ?? null);
  const externalHref = sanitizeUrl(card.url ?? status.url ?? status.uri ?? null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reading post"
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in srgb, var(--color-bg) 72%, black 28%)",
        display: "grid",
        placeItems: "center",
        padding: "var(--space-4)",
        zIndex: 54
      }}
      onClick={onClose}
    >
      <section
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(760px, 100%)",
          maxHeight: "82dvh",
          overflowY: "auto",
          borderRadius: "var(--radius-xl)",
          background: "var(--color-bg-elevated)",
          boxShadow: "var(--shadow-card)",
          padding: "var(--space-5)",
          display: "grid",
          gap: "var(--space-4)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)" }}>
          <button
            type="button"
            onClick={() => onOpenProfile(status)}
            style={{ border: 0, padding: 0, margin: 0, background: "transparent", display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer", minWidth: 0 }}
          >
            <span style={{ width: "34px", height: "34px", borderRadius: "999px", overflow: "hidden", display: "grid", placeItems: "center", background: "var(--color-bg-secondary)", position: "relative", fontSize: "var(--text-caption1)", fontWeight: 700 }}>
              <span aria-hidden="true">{accountInitials(status.account)}</span>
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt=""
                  aria-hidden="true"
                  referrerPolicy="no-referrer"
                  onError={(event) => {
                    retryImageViaProxy(event);
                  }}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : null}
            </span>
            <span style={{ display: "grid", textAlign: "left", minWidth: 0 }}>
              <strong style={{ color: "var(--color-text)", fontSize: "var(--text-subhead)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{account}</strong>
              <span style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-caption2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{accountHandle}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 0, borderRadius: "var(--radius-sm)", background: "var(--color-bg-secondary)", color: "var(--color-text)", minHeight: "36px", padding: "0 var(--space-3)" }}
          >
            Close
          </button>
        </div>

        <article style={{ display: "grid", gap: "var(--space-3)", borderRadius: "var(--radius-lg)", background: "var(--color-bg)", padding: "var(--space-4)" }}>
          {coverSrc ? (
            <div style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: "var(--radius-md)", backgroundImage: `url(${coverSrc})`, backgroundSize: "cover", backgroundPosition: "center" }} />
          ) : null}
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--text-title2)", lineHeight: "var(--leading-title2)", overflowWrap: "anywhere" }}>
            {title}
          </h2>
          <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)", lineHeight: "var(--leading-footnote)", overflowWrap: "anywhere" }}>
            {text}
          </p>
          <p style={{ margin: 0, color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
            {formatActivityDate(status.created_at)}
          </p>
        </article>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          <button
            type="button"
            onClick={() => onOpenProfile(status)}
            style={{ minHeight: "calc(var(--touch-min) - 6px)", border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)", borderRadius: "var(--radius-md)", background: "transparent", color: "var(--color-text)", fontWeight: 700, padding: "0 var(--space-4)" }}
          >
            View reader profile
          </button>
          {externalHref ? (
            <button
              type="button"
              onClick={() => window.open(externalHref, "_blank", "noopener,noreferrer")}
              style={{ minHeight: "calc(var(--touch-min) - 6px)", border: 0, borderRadius: "var(--radius-md)", background: "var(--color-accent)", color: "white", fontWeight: 700, padding: "0 var(--space-4)" }}
            >
              Open original post
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function notificationVerb(type: string): string {
  switch (type) {
    case "follow":
      return "followed you";
    case "favourite":
      return "favourited your post";
    case "mention":
      return "mentioned you";
    case "reblog":
      return "boosted your post";
    case "status":
      return "posted a new update";
    case "update":
      return "updated a post";
    default:
      return type.replace(/_/g, " ");
  }
}

function ActivityStatusRow({ status }: { status: MastodonStatus }) {
  const href = sanitizeUrl(status.url ?? status.uri ?? null);

  return (
    <article style={{
      borderRadius: "var(--radius-md)",
      background: "var(--color-bg-secondary)",
      color: "var(--color-text)",
      padding: "var(--space-4)",
      display: "grid",
      gap: "var(--space-2)",
      boxShadow: "var(--shadow-card)"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "baseline" }}>
        <strong style={{ fontSize: "var(--text-subhead)", overflowWrap: "anywhere" }}>{mastodonAccountLabel(status.account)}</strong>
        <span style={{ flex: "0 0 auto", color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
          {formatActivityDate(status.created_at)}
        </span>
      </div>
      <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)", lineHeight: "var(--leading-footnote)", overflowWrap: "anywhere" }}>
        {mastodonStatusText(status)}
      </p>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" style={{ color: "var(--color-accent)", fontSize: "var(--text-footnote)", fontWeight: 600 }}>
          Open post
        </a>
      ) : null}
    </article>
  );
}

function ActivityNotificationRow({ notification }: { notification: MastodonNotification }) {
  const statusText = notification.status ? mastodonStatusText(notification.status) : null;
  const href = sanitizeUrl(notification.status?.url ?? notification.status?.uri ?? null);

  return (
    <article style={{
      borderRadius: "var(--radius-md)",
      background: "var(--color-bg-elevated)",
      color: "var(--color-text)",
      padding: "var(--space-4)",
      display: "grid",
      gap: "var(--space-2)",
      border: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "baseline" }}>
        <strong style={{ fontSize: "var(--text-subhead)", overflowWrap: "anywhere" }}>
          {mastodonAccountLabel(notification.account)} {notificationVerb(notification.type)}
        </strong>
        <span style={{ flex: "0 0 auto", color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
          {formatActivityDate(notification.created_at)}
        </span>
      </div>
      {statusText ? (
        <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)", lineHeight: "var(--leading-footnote)", overflowWrap: "anywhere" }}>
          {statusText}
        </p>
      ) : null}
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" style={{ color: "var(--color-accent)", fontSize: "var(--text-footnote)", fontWeight: 600 }}>
          Open post
        </a>
      ) : null}
    </article>
  );
}

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [importUrl, setImportUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ExplainedGroupedResults | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeAutocompleteIndex, setActiveAutocompleteIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [instanceInput, setInstanceInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [instanceSearch, setInstanceSearch] = useState("");
  const [preferredSoftware, setPreferredSoftware] = useState<string>("bookwyrm");
  const [preferredCountry, setPreferredCountry] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [isAuthWorking, setIsAuthWorking] = useState(false);
  const [connectedAccount, setConnectedAccount] = useState<{ instanceOrigin: string; acct: string } | null>(null);
  const [activityTimeline, setActivityTimeline] = useState<MastodonStatus[]>([]);
  const [activityNotifications, setActivityNotifications] = useState<MastodonNotification[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoadedAt, setActivityLoadedAt] = useState<number | null>(null);
  const [activityRefreshNonce, setActivityRefreshNonce] = useState(0);
  const [nowReadingStatuses, setNowReadingStatuses] = useState<MastodonStatus[]>([]);
  const [nowReadingLoading, setNowReadingLoading] = useState(false);
  const [nowReadingError, setNowReadingError] = useState<string | null>(null);
  const [nowReadingLoadedAt, setNowReadingLoadedAt] = useState<number | null>(null);
  const [nowReadingRefreshNonce, setNowReadingRefreshNonce] = useState(0);
  const [bookTokTrends, setBookTokTrends] = useState<BookTokTrend[]>(CURATED_BOOKTOK_TRENDS);
  const [bookTokLoading, setBookTokLoading] = useState(false);
  const [bookTokError, setBookTokError] = useState<string | null>(null);
  const [bookTokLoadedAt, setBookTokLoadedAt] = useState<number | null>(null);
  const [bookTokRefreshNonce, setBookTokRefreshNonce] = useState(0);
  const [activeReaderProfile, setActiveReaderProfile] = useState<InAppReaderProfile | null>(null);
  const [activeNowReadingStatus, setActiveNowReadingStatus] = useState<MastodonStatus | null>(null);
  const { state } = useDatabase();
  const autocompleteResults = useAutocomplete(searchQuery);
  const preferredSoftwareSlugs = useMemo(() => (preferredSoftware ? [preferredSoftware] : []), [preferredSoftware]);
  const {
    instances: signupInstances,
    loading: signupInstancesLoading,
    error: signupInstancesError,
    refresh: refreshSignupInstances,
    refreshedAt: signupInstancesRefreshedAt
  } = useInstanceDiscovery({
    signupOnly: true,
    mastodonApiCompatibleOnly: true,
    preferredSoftwareSlugs,
    preferredCountry,
    searchQuery: instanceSearch,
    limit: 80
  });
  const { books: importedBooks, loading: importedBooksLoading, reload: reloadImportedBooks } = useImportedBooks(state === "ready");
  const shelves = useMastodonShelves(connectedAccount !== null);
  const changeTab = useCallback((tab: TabId) => setActiveTab(tab), []);
  const featuredBooks = importedBooks.length > 0 ? importedBooks : sampleBooks;

  const buildActivityEndpoint = useCallback((endpoint: string, limit: number) => {
    const url = new URL(endpoint, window.location.origin);
    url.searchParams.set("limit", String(limit));
    return url.origin === window.location.origin ? `${url.pathname}${url.search}` : url.toString();
  }, []);

  // Restore session state from the server-side session cookie on mount.
  useEffect(() => {
    let cancelled = false;
    const endpoint = import.meta.env.VITE_MASTODON_AUTH_SESSION_ENDPOINT ?? DEFAULT_MASTODON_SESSION_ENDPOINT;

    void fetchWithBackoff(endpoint, {}, 2, 8000)
      .then(async (r) => {
        if (!r.ok || cancelled) return;
        const data = await r.json() as { connected?: boolean; instanceOrigin?: string; account?: { acct: string } | null };
        if (!cancelled && data.connected && data.instanceOrigin && data.account?.acct) {
          setConnectedAccount({ instanceOrigin: data.instanceOrigin, acct: data.account.acct });
          setAuthInfo(`Connected as ${data.account.acct}`);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (connectedAccount) return;
    setActivityTimeline([]);
    setActivityNotifications([]);
    setActivityError(null);
    setActivityLoadedAt(null);
    setActivityLoading(false);
  }, [connectedAccount]);

  useEffect(() => {
    if (activeTab !== "activity" || !connectedAccount) return;

    let cancelled = false;
    const controller = new AbortController();
    const timelineEndpoint = buildActivityEndpoint(
      import.meta.env.VITE_MASTODON_HOME_TIMELINE_ENDPOINT ?? DEFAULT_MASTODON_HOME_TIMELINE_ENDPOINT,
      20
    );
    const notificationsEndpoint = buildActivityEndpoint(
      import.meta.env.VITE_MASTODON_NOTIFICATIONS_ENDPOINT ?? DEFAULT_MASTODON_NOTIFICATIONS_ENDPOINT,
      20
    );

    setActivityLoading(true);
    setActivityError(null);

    void Promise.allSettled([
      fetchWithBackoff(timelineEndpoint, { signal: controller.signal }, 3, 12_000).then(parseMastodonStatusPageResponse),
      fetchWithBackoff(notificationsEndpoint, { signal: controller.signal }, 3, 12_000).then(parseMastodonNotificationPageResponse)
    ]).then((results) => {
      if (cancelled) return;

      const [timelineResult, notificationsResult] = results;
      const failures = results.filter((result) => result.status === "rejected");
      const authFailure = failures.some((result) => {
        return result.status === "rejected" &&
          result.reason instanceof MastodonSessionApiError &&
          (result.reason.status === 401 || result.reason.status === 403);
      });

      if (authFailure) {
        setConnectedAccount(null);
        setAuthInfo(null);
        setAuthError("Your session expired. Sign in again to load activity.");
        return;
      }

      if (timelineResult.status === "fulfilled") {
        setActivityTimeline(timelineResult.value.items);
      }
      if (notificationsResult.status === "fulfilled") {
        setActivityNotifications(notificationsResult.value.items);
      }

      if (failures.length === results.length) {
        setActivityError("Activity could not be loaded right now.");
      } else if (failures.length > 0) {
        setActivityError("Some activity could not be loaded right now.");
      }

      setActivityLoadedAt(Date.now());
    }).catch((error: unknown) => {
      if (cancelled || controller.signal.aborted) return;
      setActivityError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (!cancelled) {
        setActivityLoading(false);
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeTab, buildActivityEndpoint, connectedAccount, activityRefreshNonce]);

  useEffect(() => {
    if (activeTab !== "home") {
      return;
    }

    let cancelled = false;
    const endpoint = import.meta.env.VITE_NOW_READING_ENDPOINT ?? DEFAULT_NOW_READING_ENDPOINT;

    setNowReadingLoading(true);
    setNowReadingError(null);

    void fetchWithBackoff(endpoint, {
      headers: { Accept: "application/json" }
    }, 2, 10_000)
      .then(parseMastodonStatusPageResponse)
      .then((page) => {
        if (cancelled) {
          return;
        }

        setNowReadingStatuses(page.items.slice(0, 8));
        setNowReadingLoadedAt(Date.now());
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setNowReadingStatuses([]);
        setNowReadingError(error instanceof Error
          ? `Live #NowReading feed unavailable right now. (${error.message})`
          : "Live #NowReading feed unavailable right now.");
      })
      .finally(() => {
        if (!cancelled) {
          setNowReadingLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, nowReadingRefreshNonce]);

  useEffect(() => {
    let cancelled = false;

    const callbackUrl = new URL(window.location.href);
    const code = callbackUrl.searchParams.get("code");
    const returnedState = callbackUrl.searchParams.get("state");
    const oauthError = callbackUrl.searchParams.get("error");

    if (!code && !oauthError) {
      return;
    }

    const pending = loadPendingAuthTransaction();
    if (!pending) {
      if (!cancelled) {
        setAuthError("Authentication callback was received, but no active login transaction was found.");
      }
      return () => {
        cancelled = true;
      };
    }

    if (oauthError) {
      if (!cancelled) {
        setAuthError(`Authorization failed: ${oauthError}`);
      }
      clearPendingAuthTransaction();
      callbackUrl.search = "";
      window.history.replaceState({}, "", callbackUrl.toString());
      return () => {
        cancelled = true;
      };
    }

    if (!returnedState || returnedState !== pending.state) {
      if (!cancelled) {
        setAuthError("State validation failed. Please retry login.");
      }
      clearPendingAuthTransaction();
      callbackUrl.search = "";
      window.history.replaceState({}, "", callbackUrl.toString());
      return () => {
        cancelled = true;
      };
    }

    if (!cancelled) {
      setIsAuthWorking(true);
      setAuthError(null);
      setAuthInfo("Authorization callback validated. Exchanging code...");
    }

    const exchangeEndpoint = import.meta.env.VITE_MASTODON_AUTH_EXCHANGE_ENDPOINT ?? DEFAULT_MASTODON_EXCHANGE_ENDPOINT;
    const exchangePayload = parseMastodonExchangeRequest({
      instanceOrigin: pending.instanceOrigin,
      code,
      codeVerifier: pending.codeVerifier,
      redirectUri: pending.redirectUri
    });

    void (async () => {
      try {
        const response = await fetchWithBackoff(exchangeEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(exchangePayload)
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || `Exchange failed (${response.status})`);
        }

        const payload = parseMastodonExchangeResponse(await response.json());
        const accountText = payload.account ? ` as ${payload.account.acct}` : "";
        if (!cancelled) {
          setAuthInfo(`Account connected${accountText}. Token exchange completed.`);
          if (payload.account && payload.instanceOrigin) {
            setConnectedAccount({ instanceOrigin: payload.instanceOrigin, acct: payload.account.acct });
          }
        }
        clearPendingAuthTransaction();
      } catch (error: unknown) {
        if (!cancelled) {
          setAuthError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setIsAuthWorking(false);
        }
        callbackUrl.search = "";
        window.history.replaceState({}, "", callbackUrl.toString());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state !== "ready") return;
    scheduleSearchIndexDependencyHealthCheck();
    scheduleSearchIndexHealthCheck();
  }, [state]);

  useEffect(() => {
    const query = normalizeSearchQuery(searchQuery);

    if (query.length < 2 || state !== "ready") {
      setSearchResults(null);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    setSearchError(null);

    const timeout = window.setTimeout(() => {
      void loadSearchRuntime()
        .then(({ searchAll }) => searchAll(query, { context: { surface: "global" } }))
        .then((results) => {
          if (!cancelled) setSearchResults(results as ExplainedGroupedResults | null);
        })
        .catch((error) => {
          if (!cancelled) {
            setSearchResults(null);
            setSearchError(error instanceof Error ? error.message : String(error));
          }
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [searchQuery, state]);

  const handleSearchResultSelect = useCallback((result: ExplainedSearchResult) => {
    const query = normalizeSearchQuery(searchQuery);
    if (!query) return;

    void loadSearchRuntime().then(({ classifyQueryIntent, getAdaptiveAlpha, recordClick }) => {
      const intent = classifyQueryIntent(query);
      const alpha = getAdaptiveAlpha(intent.alpha, intent.intent);
      recordClick(query, result.id, intent.intent, alpha);
    });
  }, [searchQuery]);

  const visibleAutocompleteResults = useMemo(() => {
    if (normalizeSearchQuery(searchQuery).length < 2) {
      return [];
    }
    return autocompleteResults.slice(0, 6);
  }, [autocompleteResults, searchQuery]);

  const applySearchSuggestion = useCallback((title: string) => {
    setSearchQuery(title);
    setActiveAutocompleteIndex(-1);
  }, []);

  useEffect(() => {
    setActiveAutocompleteIndex((current) => {
      if (visibleAutocompleteResults.length === 0) {
        return -1;
      }
      if (current >= visibleAutocompleteResults.length) {
        return visibleAutocompleteResults.length - 1;
      }
      return current;
    });
  }, [visibleAutocompleteResults]);

  const importBook = useCallback(async () => {
    const trimmedUrl = importUrl.trim();
    if (!trimmedUrl || state !== "ready") return;

    setIsImporting(true);
    setImportError(null);
    try {
      const { getRxDBActivityPubStore, ActivityPubResolver } = await loadImportRuntime();
      const store = await getRxDBActivityPubStore();
      const resolver = new ActivityPubResolver(store);
      await resolver.importEditionFromUrl(trimmedUrl);
      setImportUrl("");
      await reloadImportedBooks();
      setActiveTab("home");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImporting(false);
    }
  }, [importUrl, reloadImportedBooks, state]);

  const startMastodonLogin = useCallback(async () => {
    setAuthError(null);
    setAuthInfo(null);

    let normalizedInstance = "";
    try {
      normalizedInstance = normalizeInstanceOrigin(instanceInput);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
      return;
    }

    setIsAuthWorking(true);
    try {
      const discovery = await discoverMastodonOAuth(normalizedInstance);
      const redirectUri = getOAuthRedirectUri();
      const registerEndpoint = import.meta.env.VITE_MASTODON_AUTH_REGISTER_ENDPOINT ?? DEFAULT_MASTODON_REGISTER_ENDPOINT;
      const registerPayload = parseMastodonRegisterRequest({
        instanceOrigin: discovery.instanceOrigin,
        redirectUris: [redirectUri],
        scopes: discovery.scopeDecision.requestedScopes
      });

      const registerResponse = await fetchWithBackoff(registerEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerPayload)
      });

      if (!registerResponse.ok) {
        const body = await registerResponse.text();
        throw new Error(body || `App registration failed (${registerResponse.status})`);
      }

      const app = parseMastodonRegisterResponse(await registerResponse.json());
      if (!app.clientId) {
        throw new Error("App registration response did not include a clientId.");
      }

      const transaction = await createPendingAuthTransaction({
        instanceOrigin: discovery.instanceOrigin,
        requestedScopes: discovery.scopeDecision.requestedScopes,
        redirectUri
      });

      savePendingAuthTransaction({
        instanceOrigin: transaction.instanceOrigin,
        state: transaction.state,
        codeVerifier: transaction.codeVerifier,
        requestedScopes: transaction.requestedScopes,
        redirectUri: transaction.redirectUri,
        createdAt: transaction.createdAt
      });

      if (!discovery.supportsPkceS256 && discovery.discovered) {
        setAuthInfo("This instance did not report S256 PKCE in metadata. Proceeding with standards-based parameters.");
      } else if (discovery.fallbackReason) {
        setAuthInfo(`OAuth metadata fallback in use: ${discovery.fallbackReason}`);
      }

      const authorizeUrl = buildAuthorizeUrl({
        authorizationEndpoint: discovery.endpoints.authorization,
        clientId: app.clientId,
        redirectUri,
        authScope: transaction.authScope,
        state: transaction.state,
        codeChallenge: transaction.codeChallenge,
        forceLogin: true
      });

      window.location.assign(authorizeUrl);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAuthWorking(false);
    }
  }, [instanceInput]);

  const disconnectMastodon = useCallback(async () => {
    setIsAuthWorking(true);
    setAuthError(null);
    try {
      const endpoint = import.meta.env.VITE_MASTODON_AUTH_REVOKE_ENDPOINT ?? DEFAULT_MASTODON_REVOKE_ENDPOINT;
      await fetchWithBackoff(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      setConnectedAccount(null);
      setAuthInfo(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAuthWorking(false);
    }
  }, []);

  const applyDiscoveredInstance = useCallback((domain: string) => {
    setInstanceInput(domain);
    setAuthError(null);
    setAuthInfo(null);
    setPickerOpen(false);
  }, []);

  const selectedInstanceOrigin = useMemo(() => {
    const trimmed = instanceInput.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return normalizeInstanceOrigin(trimmed);
    } catch {
      return null;
    }
  }, [instanceInput]);

  const openInstanceSite = useCallback((instanceOrigin: string | null) => {
    if (!instanceOrigin) {
      setAuthError("Select a valid server before opening it.");
      return;
    }

    setAuthError(null);
    window.open(instanceOrigin, "_blank", "noopener,noreferrer");
  }, []);

  const openMemberSignIn = useCallback(() => {
    setActiveTab("profile");
  }, []);

  const openMemberSignup = useCallback(() => {
    setActiveTab("profile");
    setPickerOpen(true);
  }, []);

  const openReaderProfile = useCallback((status: MastodonStatus) => {
    setActiveReaderProfile(buildReaderProfileFromStatus(status, nowReadingStatuses));
  }, [nowReadingStatuses]);

  const openNowReadingStatus = useCallback((status: MastodonStatus) => {
    setActiveNowReadingStatus(status);
  }, []);

  const availableCountries = useMemo(() => {
    const set = new Set<string>();
    for (const instance of signupInstances) {
      if (instance.country) set.add(instance.country);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [signupInstances]);

  const topAutocompleteInstances = useMemo(() => signupInstances.slice(0, 20), [signupInstances]);
  const importUrlHints = useMemo(
    () => topAutocompleteInstances.map((instance) => `https://${instance.domain}/book/`),
    [topAutocompleteInstances]
  );
  const bookTokCoverBooks = useMemo(() => {
    return bookTokTrends.map((trend) => ({
      id: trend.id,
      title: trend.title,
      author: trend.author,
      coverUrl: trend.coverUrl,
      sourceUrl: trend.sourceUrl
    }));
  }, [bookTokTrends]);

  useEffect(() => {
    if (activeTab !== "home") {
      return;
    }

    let cancelled = false;
    const endpoint = import.meta.env.VITE_BOOKTOK_TRENDING_ENDPOINT ?? DEFAULT_BOOKTOK_TRENDING_ENDPOINT;

    setBookTokLoading(true);
    setBookTokError(null);

    void fetchWithBackoff(endpoint, {
      headers: { Accept: "application/json" }
    }, 3, 10_000)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`BookTok trending request failed (${response.status})`);
        }

        return parseBookTokTrendingPayload(await response.json());
      })
      .then((trends) => {
        if (cancelled) {
          return;
        }

        if (trends.length > 0) {
          setBookTokTrends(trends.slice(0, 9));
        } else {
          setBookTokTrends(CURATED_BOOKTOK_TRENDS);
        }
        setBookTokLoadedAt(Date.now());
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setBookTokTrends(CURATED_BOOKTOK_TRENDS);
        setBookTokError(error instanceof Error
          ? `Live BookTok sync unavailable. Showing curated picks. (${error.message})`
          : "Live BookTok sync unavailable. Showing curated picks.");
      })
      .finally(() => {
        if (!cancelled) {
          setBookTokLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, bookTokRefreshNonce]);

  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <div style={{
          width: "100%",
          height: "100dvh",
          display: "flex",
          flexDirection: "column",
          background: "var(--color-bg)",
          color: "var(--color-text)",
          overflow: "hidden"
        }}>
          <OfflineIndicator />
          <main style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>
            <AnimatePresence mode="wait">
              {activeTab === "home" && (
                <TabPanel id="home" activeTab={activeTab}>
                  <ScreenTitle eyebrow="Good evening" title="Library" />
                  <section style={{
                    padding: "0 var(--space-4)",
                    marginBottom: "var(--space-6)"
                  }}>
                    <article style={{
                      borderRadius: "var(--radius-lg)",
                      background: "var(--color-bg-secondary)",
                      boxShadow: "var(--shadow-card)",
                      padding: "var(--space-4)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "var(--space-4)",
                      flexWrap: "wrap"
                    }}>
                      <div style={{ display: "grid", gap: "var(--space-1)", minWidth: "min(100%, 220px)" }}>
                        <strong style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-headline)", color: "var(--color-text)" }}>Member access</strong>
                        <span style={{ fontSize: "var(--text-footnote)", lineHeight: "var(--leading-footnote)", color: "var(--color-text-secondary)" }}>
                          Sign in or create an account to sync reading activity.
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={openMemberSignIn}
                          style={{
                            minHeight: "var(--touch-min)",
                            border: "1px solid color-mix(in srgb, var(--color-text) 14%, transparent)",
                            borderRadius: "var(--radius-md)",
                            background: "transparent",
                            color: "var(--color-text)",
                            fontWeight: 700,
                            fontSize: "var(--text-footnote)",
                            padding: "0 var(--space-4)"
                          }}
                        >
                          Member sign in
                        </button>
                        <button
                          type="button"
                          onClick={openMemberSignup}
                          style={{
                            minHeight: "var(--touch-min)",
                            border: 0,
                            borderRadius: "var(--radius-md)",
                            background: "var(--color-accent)",
                            color: "white",
                            fontWeight: 700,
                            fontSize: "var(--text-footnote)",
                            padding: "0 var(--space-4)"
                          }}
                        >
                          Become a member
                        </button>
                      </div>
                    </article>
                  </section>
                  <SectionHeader
                    title="Currently Reading"
                    actionLabel={nowReadingLoading ? undefined : "Refresh"}
                    onAction={nowReadingLoading ? undefined : () => setNowReadingRefreshNonce((value) => value + 1)}
                  />
                  {nowReadingLoading && nowReadingStatuses.length === 0 ? (
                    <SkeletonCoverGrid count={3} />
                  ) : nowReadingStatuses.length > 0 ? (
                    <NowReadingStatusGrid
                      statuses={nowReadingStatuses.slice(0, 6)}
                      importedBooks={importedBooks}
                      onOpenProfile={openReaderProfile}
                      onOpenStatus={openNowReadingStatus}
                    />
                  ) : (
                    <div style={{ padding: "0 var(--space-4)" }}>
                      <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                        No live #NowReading posts found right now.
                      </p>
                    </div>
                  )}
                  {nowReadingError ? (
                    <p style={{ margin: "var(--space-3) var(--space-4) 0", color: "#c23b3b", fontSize: "var(--text-footnote)" }}>
                      {nowReadingError}
                    </p>
                  ) : nowReadingLoadedAt ? (
                    <p style={{ margin: "var(--space-3) var(--space-4) 0", color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
                      Currently Reading updated: {new Date(nowReadingLoadedAt).toLocaleString()}
                    </p>
                  ) : null}
                  <div style={{ height: "var(--space-8)" }} />
                  <SectionHeader title={importedBooks.length > 0 ? "Imported From BookWyrm" : "Recently Added"} />
                  <CoverGrid books={featuredBooks.slice(3).length > 0 ? featuredBooks.slice(3, 9) : featuredBooks.slice(0, 6)} />
                  <div style={{ height: "var(--space-8)" }} />
                  <SectionHeader
                    title="BookTok Trending"
                    actionLabel={bookTokLoading ? undefined : "Refresh"}
                    onAction={bookTokLoading ? undefined : () => setBookTokRefreshNonce((value) => value + 1)}
                  />
                  {bookTokLoading && bookTokTrends.length === 0 ? (
                    <SkeletonCoverGrid count={3} />
                  ) : (
                    <CoverGrid books={bookTokCoverBooks.slice(0, 9)} />
                  )}
                  {bookTokError ? (
                    <p style={{ margin: "var(--space-3) var(--space-4) 0", color: "#c23b3b", fontSize: "var(--text-footnote)" }}>
                      {bookTokError}
                    </p>
                  ) : bookTokLoadedAt ? (
                    <p style={{ margin: "var(--space-3) var(--space-4) 0", color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
                      BookTok updated: {new Date(bookTokLoadedAt).toLocaleString()}
                    </p>
                  ) : (
                    <p style={{ margin: "var(--space-3) var(--space-4) 0", color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
                      Showing curated BookTok picks while live trend sync initializes.
                    </p>
                  )}
                </TabPanel>
              )}
              {activeTab === "search" && (
                <TabPanel id="search" activeTab={activeTab}>
                  <ScreenTitle title="Search" />
                  <section style={{ padding: "0 var(--space-4)", display: "grid", gap: "var(--space-4)" }}>
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => {
                        setSearchQuery(event.target.value);
                        setActiveAutocompleteIndex(-1);
                      }}
                      onKeyDown={(event) => {
                        if (!visibleAutocompleteResults.length) {
                          return;
                        }

                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          setActiveAutocompleteIndex((current) => (current + 1) % visibleAutocompleteResults.length);
                          return;
                        }

                        if (event.key === "ArrowUp") {
                          event.preventDefault();
                          setActiveAutocompleteIndex((current) => {
                            if (current <= 0) {
                              return visibleAutocompleteResults.length - 1;
                            }
                            return current - 1;
                          });
                          return;
                        }

                        if (event.key === "Enter" && activeAutocompleteIndex >= 0) {
                          event.preventDefault();
                          const match = visibleAutocompleteResults[activeAutocompleteIndex];
                          if (match) {
                            applySearchSuggestion(match.title);
                          }
                          return;
                        }

                        if (event.key === "Escape" && activeAutocompleteIndex >= 0) {
                          event.preventDefault();
                          setActiveAutocompleteIndex(-1);
                        }
                      }}
                      placeholder="Search books, authors, ISBNs, themes..."
                      aria-label="Search library"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={visibleAutocompleteResults.length > 0}
                      aria-controls={SEARCH_AUTOCOMPLETE_LIST_ID}
                      aria-activedescendant={
                        activeAutocompleteIndex >= 0 && visibleAutocompleteResults[activeAutocompleteIndex]
                          ? `search-autocomplete-option-${visibleAutocompleteResults[activeAutocompleteIndex].id}`
                          : undefined
                      }
                      style={{
                        width: "100%",
                        minHeight: "var(--touch-min)",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)",
                        background: "var(--color-bg-secondary)",
                        color: "var(--color-text)",
                        padding: "0 var(--space-3)",
                        fontSize: "var(--text-body)"
                      }}
                    />
                    {visibleAutocompleteResults.length > 0 ? (
                      <div
                        id={SEARCH_AUTOCOMPLETE_LIST_ID}
                        role="listbox"
                        aria-label="Search suggestions"
                        style={{
                        display: "grid",
                        gap: "var(--space-2)",
                        padding: "var(--space-2)",
                        borderRadius: "var(--radius-md)",
                        background: "var(--color-bg-secondary)",
                        border: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)"
                      }}>
                        {visibleAutocompleteResults.map((suggestion, index) => (
                          <button
                            key={suggestion.id}
                            id={`search-autocomplete-option-${suggestion.id}`}
                            type="button"
                            role="option"
                            aria-selected={index === activeAutocompleteIndex}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseEnter={() => setActiveAutocompleteIndex(index)}
                            onClick={() => applySearchSuggestion(suggestion.title)}
                            style={{
                              border: 0,
                              borderRadius: "var(--radius-sm)",
                              minHeight: "calc(var(--touch-min) - 8px)",
                              background: index === activeAutocompleteIndex ? "color-mix(in srgb, var(--color-accent) 20%, var(--color-bg))" : "var(--color-bg)",
                              color: "var(--color-text)",
                              textAlign: "left",
                              padding: "0 var(--space-3)"
                            }}
                          >
                            {suggestion.title}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div style={{
                      display: "grid",
                      gap: "var(--space-3)",
                      padding: "var(--space-4)",
                      borderRadius: "var(--radius-lg)",
                      background: "var(--color-bg-secondary)",
                      boxShadow: "var(--shadow-card)"
                    }}>
                      <input
                        type="url"
                        inputMode="url"
                        value={importUrl}
                        onChange={(event) => setImportUrl(event.target.value)}
                        placeholder="https://bookwyrm.social/book/..."
                        aria-label="BookWyrm edition URL"
                        autoComplete="on"
                        spellCheck={false}
                        list={IMPORT_URL_DATALIST_ID}
                        style={{
                          width: "100%",
                          minHeight: "var(--touch-min)",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)",
                          background: "var(--color-bg)",
                          color: "var(--color-text)",
                          padding: "0 var(--space-3)",
                          fontSize: "var(--text-body)"
                        }}
                      />
                      <datalist id={IMPORT_URL_DATALIST_ID}>
                        {importUrlHints.map((hint) => (
                          <option key={hint} value={hint} />
                        ))}
                      </datalist>
                      <button
                        type="button"
                        onClick={() => void importBook()}
                        disabled={isImporting || state !== "ready" || !importUrl.trim()}
                        style={{
                          minHeight: "var(--touch-min)",
                          border: 0,
                          borderRadius: "var(--radius-md)",
                          background: "var(--color-accent)",
                          color: "white",
                          fontWeight: 700,
                          padding: "0 var(--space-4)",
                          opacity: isImporting || state !== "ready" || !importUrl.trim() ? 0.6 : 1
                        }}
                      >
                        {isImporting ? "Importing..." : "Import edition"}
                      </button>
                      {importError ? <p style={{ margin: 0, color: "#c23b3b" }}>{importError}</p> : null}
                    </div>
                  </section>
                  <div style={{ height: "var(--space-6)" }} />
                  {searchError ? <p style={{ padding: "0 var(--space-4)", color: "#c23b3b" }}>{searchError}</p> : null}
                  {isSearching ? <SkeletonCoverGrid count={3} /> : null}
                  {searchResults && searchResults.all.length > 0 ? (
                    <div style={{ display: "grid", gap: "var(--space-6)" }}>
                      <SearchResultsSection title="Editions" query={normalizeSearchQuery(searchQuery)} results={searchResults.editions} onSelect={handleSearchResultSelect} />
                      <SearchResultsSection title="Works" query={normalizeSearchQuery(searchQuery)} results={searchResults.works} onSelect={handleSearchResultSelect} />
                      <SearchResultsSection title="Authors" query={normalizeSearchQuery(searchQuery)} results={searchResults.authors} onSelect={handleSearchResultSelect} />
                    </div>
                  ) : normalizeSearchQuery(searchQuery).length >= 2 && !isSearching ? (
                    <EmptyState title="No results" description="Try another title, author, ISBN, or theme." />
                  ) : importedBooks.length > 0 ? (
                    <>
                      <SectionHeader title="Imported Editions" />
                      <CoverGrid books={importedBooks} />
                    </>
                  ) : (
                    <EmptyState title="No imported books yet" description="BookWyrm editions you import will appear here." />
                  )}
                </TabPanel>
              )}
              {activeTab === "shelves" && (
                <TabPanel id="shelves" activeTab={activeTab}>
                  <ScreenTitle title="Shelves" />
                  {!connectedAccount ? (
                    <EmptyState title="Sign in to load shelves" description="Your Mastodon bookmarks, favourites, and lists will appear here." />
                  ) : (
                    <div style={{ display: "grid", gap: "var(--space-6)" }}>
                      <section style={{ display: "grid", gap: "var(--space-3)" }}>
                        <SectionHeader
                          title="Bookmarks"
                          actionLabel={shelves.loading ? undefined : "Refresh"}
                          onAction={shelves.loading ? undefined : shelves.reload}
                        />
                        <div style={{ display: "grid", gap: "var(--space-3)", padding: "0 var(--space-4)" }}>
                          {shelves.loading && shelves.bookmarks.length === 0 ? (
                            <>
                              <Skeleton style={{ height: 92 }} />
                              <Skeleton style={{ height: 92 }} />
                            </>
                          ) : shelves.bookmarks.length > 0 ? (
                            shelves.bookmarks.map((status) => (
                              <ActivityStatusRow key={status.id} status={status} />
                            ))
                          ) : (
                            <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                              No bookmarks yet.
                            </p>
                          )}
                        </div>
                      </section>
                      <section style={{ display: "grid", gap: "var(--space-3)" }}>
                        <SectionHeader title="Favourites" />
                        <div style={{ display: "grid", gap: "var(--space-3)", padding: "0 var(--space-4)" }}>
                          {shelves.loading && shelves.favourites.length === 0 ? (
                            <>
                              <Skeleton style={{ height: 92 }} />
                              <Skeleton style={{ height: 92 }} />
                            </>
                          ) : shelves.favourites.length > 0 ? (
                            shelves.favourites.map((status) => (
                              <ActivityStatusRow key={status.id} status={status} />
                            ))
                          ) : (
                            <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                              No favourites yet.
                            </p>
                          )}
                        </div>
                      </section>
                      {shelves.lists.length > 0 ? (
                        <section style={{ display: "grid", gap: "var(--space-3)" }}>
                          <SectionHeader title="Lists" />
                          <div style={{ display: "grid", gap: "var(--space-2)", padding: "0 var(--space-4)" }}>
                            {shelves.lists.map((list: MastodonList) => (
                              <div
                                key={list.id}
                                style={{
                                  borderRadius: "var(--radius-md)",
                                  background: "var(--color-bg-secondary)",
                                  color: "var(--color-text)",
                                  padding: "var(--space-3) var(--space-4)",
                                  fontWeight: 600,
                                  fontSize: "var(--text-subhead)",
                                  boxShadow: "var(--shadow-card)"
                                }}
                              >
                                {list.title}
                              </div>
                            ))}
                          </div>
                        </section>
                      ) : null}
                      {shelves.error === "unauthenticated" ? (
                        <p style={{ margin: "0 var(--space-4)", color: "#c23b3b", fontSize: "var(--text-footnote)" }}>
                          Your session expired. Sign in again to load shelves.
                        </p>
                      ) : shelves.error === "network" ? (
                        <p style={{ margin: "0 var(--space-4)", color: "#c23b3b", fontSize: "var(--text-footnote)" }}>
                          Shelves could not be loaded right now.
                        </p>
                      ) : null}
                    </div>
                  )}
                </TabPanel>
              )}
              {activeTab === "activity" && (
                <TabPanel id="activity" activeTab={activeTab}>
                  <ScreenTitle title="Activity" />
                  {!connectedAccount ? (
                    <EmptyState title="Sign in to load activity" description="Your home timeline, notifications, and reading updates will appear here." />
                  ) : (
                    <div style={{ display: "grid", gap: "var(--space-6)" }}>
                      <section style={{ display: "grid", gap: "var(--space-3)" }}>
                        <SectionHeader
                          title="Notifications"
                          actionLabel={activityLoading ? undefined : "Refresh"}
                          onAction={activityLoading ? undefined : () => setActivityRefreshNonce((value) => value + 1)}
                        />
                        <div style={{ display: "grid", gap: "var(--space-3)", padding: "0 var(--space-4)" }}>
                          {activityLoading && activityNotifications.length === 0 ? (
                            <>
                              <Skeleton style={{ height: 92 }} />
                              <Skeleton style={{ height: 92 }} />
                            </>
                          ) : activityNotifications.length > 0 ? (
                            activityNotifications.map((notification) => (
                              <ActivityNotificationRow key={notification.id} notification={notification} />
                            ))
                          ) : (
                            <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                              No notifications yet.
                            </p>
                          )}
                        </div>
                      </section>
                      <section style={{ display: "grid", gap: "var(--space-3)" }}>
                        <SectionHeader title="Home Timeline" />
                        <div style={{ display: "grid", gap: "var(--space-3)", padding: "0 var(--space-4)" }}>
                          {activityLoading && activityTimeline.length === 0 ? (
                            <>
                              <Skeleton style={{ height: 120 }} />
                              <Skeleton style={{ height: 120 }} />
                              <Skeleton style={{ height: 120 }} />
                            </>
                          ) : activityTimeline.length > 0 ? (
                            activityTimeline.map((status) => (
                              <ActivityStatusRow key={status.id} status={status} />
                            ))
                          ) : (
                            <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                              No timeline posts yet.
                            </p>
                          )}
                        </div>
                      </section>
                      {activityError ? (
                        <p style={{ margin: "0 var(--space-4)", color: "#c23b3b", fontSize: "var(--text-footnote)" }}>
                          {activityError}
                        </p>
                      ) : activityLoadedAt ? (
                        <p style={{ margin: "0 var(--space-4)", color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
                          Last updated: {new Date(activityLoadedAt).toLocaleString()}
                        </p>
                      ) : null}
                    </div>
                  )}
                </TabPanel>
              )}
              {activeTab === "profile" && (
                <TabPanel id="profile" activeTab={activeTab}>
                  <ScreenTitle title="Account" />
                  <section style={{ padding: "0 var(--space-4)", display: "grid", gap: "var(--space-4)" }}>
                    <div style={{
                      display: "grid",
                      gap: "var(--space-3)",
                      padding: "var(--space-4)",
                      borderRadius: "var(--radius-lg)",
                      background: "var(--color-bg-secondary)",
                      boxShadow: "var(--shadow-card)"
                    }}>
                      {connectedAccount !== null ? (
                        <>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: "var(--text-subhead)", color: "var(--color-text)" }}>
                            {connectedAccount.acct}
                          </p>
                          <p style={{ margin: 0, color: "var(--color-text-tertiary)", fontSize: "var(--text-footnote)" }}>
                            {connectedAccount.instanceOrigin}
                          </p>
                          <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                            Disconnect to switch to another server or account.
                          </p>
                          <button
                            type="button"
                            onClick={() => void disconnectMastodon()}
                            disabled={isAuthWorking}
                            style={{
                              minHeight: "var(--touch-min)",
                              border: "1px solid color-mix(in srgb, var(--color-text) 20%, transparent)",
                              borderRadius: "var(--radius-md)",
                              background: "transparent",
                              color: "var(--color-text)",
                              fontWeight: 700,
                              padding: "0 var(--space-4)",
                              opacity: isAuthWorking ? 0.6 : 1
                            }}
                          >
                            {isAuthWorking ? "Disconnecting..." : "Disconnect account"}
                          </button>
                        </>
                      ) : (
                        <div style={{ display: "grid", gap: "var(--space-4)" }}>
                          <div style={{
                            display: "grid",
                            gap: "var(--space-1)",
                            padding: "var(--space-3)",
                            borderRadius: "var(--radius-md)",
                            background: "color-mix(in srgb, var(--color-accent) 8%, var(--color-bg))",
                            border: "1px solid color-mix(in srgb, var(--color-accent) 18%, transparent)"
                          }}>
                            <strong style={{ fontSize: "var(--text-subhead)", color: "var(--color-text)" }}>Use the server you already know, or pick one and come back when your account is ready.</strong>
                            <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                              RYU keeps sign-in and server discovery separate so you can move through either path cleanly.
                            </p>
                          </div>
                          <div style={{
                            display: "grid",
                            gap: "var(--space-4)",
                            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))"
                          }}>
                            <section style={{
                              display: "grid",
                              gap: "var(--space-3)",
                              padding: "var(--space-4)",
                              borderRadius: "var(--radius-md)",
                              background: "var(--color-bg)",
                              border: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)"
                            }}>
                              <div style={{ display: "grid", gap: "var(--space-1)" }}>
                                <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--text-headline)" }}>Sign in</h2>
                                <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                                  Enter your home server and continue through secure OAuth sign-in.
                                </p>
                              </div>
                              <input
                                type="text"
                                value={instanceInput}
                                onChange={(event) => setInstanceInput(event.target.value)}
                                placeholder="bookwyrm.social"
                                aria-label="BookWyrm or Mastodon instance"
                                autoComplete="on"
                                spellCheck={false}
                                list={INSTANCE_DATALIST_ID}
                                style={{
                                  width: "100%",
                                  minHeight: "var(--touch-min)",
                                  borderRadius: "var(--radius-md)",
                                  border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)",
                                  background: "var(--color-bg-secondary)",
                                  color: "var(--color-text)",
                                  padding: "0 var(--space-3)",
                                  fontSize: "var(--text-body)"
                                }}
                              />
                              <datalist id={INSTANCE_DATALIST_ID}>
                                {topAutocompleteInstances.map((instance) => (
                                  <option key={instance.domain} value={instance.domain} label={`${instance.softwareName ?? "Fediverse"}${instance.country ? ` • ${instance.country}` : ""}`} />
                                ))}
                              </datalist>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                                <button
                                  type="button"
                                  onClick={() => void startMastodonLogin()}
                                  disabled={isAuthWorking || !instanceInput.trim()}
                                  style={{
                                    minHeight: "var(--touch-min)",
                                    border: 0,
                                    borderRadius: "var(--radius-md)",
                                    background: "var(--color-accent)",
                                    color: "white",
                                    fontWeight: 700,
                                    padding: "0 var(--space-4)",
                                    opacity: isAuthWorking || !instanceInput.trim() ? 0.6 : 1
                                  }}
                                >
                                  {isAuthWorking ? "Working..." : "Sign in with this server"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPickerOpen(true)}
                                  style={{
                                    minHeight: "var(--touch-min)",
                                    border: "1px solid color-mix(in srgb, var(--color-text) 14%, transparent)",
                                    borderRadius: "var(--radius-md)",
                                    background: "transparent",
                                    color: "var(--color-text)",
                                    fontWeight: 600,
                                    padding: "0 var(--space-4)"
                                  }}
                                >
                                  Find server
                                </button>
                              </div>
                            </section>
                            <section style={{
                              display: "grid",
                              gap: "var(--space-3)",
                              padding: "var(--space-4)",
                              borderRadius: "var(--radius-md)",
                              background: "var(--color-bg)",
                              border: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)"
                            }}>
                              <div style={{ display: "grid", gap: "var(--space-1)" }}>
                                <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--text-headline)" }}>Create account</h2>
                                <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                                  Browse open-registration servers filtered for compatibility and safety, then open one to create your account.
                                </p>
                              </div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                                <button
                                  type="button"
                                  onClick={() => void refreshSignupInstances(true)}
                                  disabled={signupInstancesLoading}
                                  style={{
                                    border: 0,
                                    borderRadius: "var(--radius-sm)",
                                    minHeight: "calc(var(--touch-min) - 8px)",
                                    background: "var(--color-bg-secondary)",
                                    color: "var(--color-text)",
                                    padding: "0 var(--space-3)",
                                    fontSize: "var(--text-footnote)",
                                    opacity: signupInstancesLoading ? 0.6 : 1
                                  }}
                                >
                                  {signupInstancesLoading ? "Refreshing..." : "Refresh list"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPickerOpen(true)}
                                  style={{
                                    border: 0,
                                    borderRadius: "var(--radius-sm)",
                                    minHeight: "calc(var(--touch-min) - 8px)",
                                    background: "var(--color-accent)",
                                    color: "white",
                                    padding: "0 var(--space-3)",
                                    fontSize: "var(--text-footnote)",
                                    fontWeight: 600
                                  }}
                                >
                                  Browse servers
                                </button>
                              </div>
                              {instanceInput.trim() ? (
                                <div style={{ display: "grid", gap: "var(--space-2)" }}>
                                  <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                                    Selected server: <strong style={{ color: "var(--color-text)" }}>{selectedInstanceOrigin ?? instanceInput.trim()}</strong>
                                  </p>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                                    <button
                                      type="button"
                                      onClick={() => openInstanceSite(selectedInstanceOrigin)}
                                      style={{
                                        minHeight: "calc(var(--touch-min) - 8px)",
                                        border: "1px solid color-mix(in srgb, var(--color-text) 14%, transparent)",
                                        borderRadius: "var(--radius-sm)",
                                        background: "transparent",
                                        color: "var(--color-text)",
                                        fontWeight: 600,
                                        padding: "0 var(--space-3)"
                                      }}
                                    >
                                      Open server
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void startMastodonLogin()}
                                      disabled={isAuthWorking || !selectedInstanceOrigin}
                                      style={{
                                        minHeight: "calc(var(--touch-min) - 8px)",
                                        border: 0,
                                        borderRadius: "var(--radius-sm)",
                                        background: "var(--color-accent)",
                                        color: "white",
                                        fontWeight: 600,
                                        padding: "0 var(--space-3)",
                                        opacity: isAuthWorking || !selectedInstanceOrigin ? 0.6 : 1
                                      }}
                                    >
                                      {isAuthWorking ? "Working..." : "Continue with this server"}
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                              {signupInstancesError ? (
                                <p style={{ margin: 0, color: "#c23b3b", fontSize: "var(--text-footnote)" }}>
                                  {signupInstancesError}
                                </p>
                              ) : null}
                              {signupInstances.length === 0 ? (
                                <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                                  {signupInstancesLoading ? "Loading eligible instances..." : "No eligible instances found right now."}
                                </p>
                              ) : null}
                              {signupInstancesRefreshedAt ? (
                                <p style={{ margin: 0, color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
                                  Last refreshed: {new Date(signupInstancesRefreshedAt).toLocaleString()}
                                </p>
                              ) : null}
                            </section>
                          </div>
                        </div>
                      )}
                      {authInfo ? <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>{authInfo}</p> : null}
                      {authError ? <p style={{ margin: 0, color: "#c23b3b", fontSize: "var(--text-footnote)" }}>{authError}</p> : null}
                    </div>
                    <EmptyState
                      title="Backend exchange required"
                      description="Mastodon currently provisions confidential clients, so token exchange must run on a backend endpoint and never in browser-only code."
                    />
                  </section>
                  {pickerOpen ? (
                    <div
                      role="dialog"
                      aria-modal="true"
                      aria-label="Instance picker"
                      style={{
                        position: "fixed",
                        inset: 0,
                        background: "color-mix(in srgb, var(--color-bg) 70%, black 30%)",
                        display: "grid",
                        placeItems: "center",
                        padding: "var(--space-4)",
                        zIndex: 40
                      }}
                      onClick={() => setPickerOpen(false)}
                    >
                      <section
                        onClick={(event) => event.stopPropagation()}
                        style={{
                          width: "min(760px, 100%)",
                          maxHeight: "80dvh",
                          overflow: "hidden",
                          background: "var(--color-bg-elevated)",
                          borderRadius: "var(--radius-xl)",
                          boxShadow: "var(--shadow-card)",
                          display: "grid",
                          gridTemplateRows: "auto auto 1fr auto",
                          gap: "var(--space-3)",
                          padding: "var(--space-4)"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)" }}>
                          <div style={{ display: "grid", gap: "var(--space-1)" }}>
                            <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--text-title3)" }}>Find a server</h2>
                            <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
                              Open a server to create an account, or use it immediately if you already have one there.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPickerOpen(false)}
                            style={{
                              border: 0,
                              borderRadius: "var(--radius-sm)",
                              background: "var(--color-bg-secondary)",
                              color: "var(--color-text)",
                              minHeight: "calc(var(--touch-min) - 10px)",
                              padding: "0 var(--space-3)"
                            }}
                          >
                            Close
                          </button>
                        </div>
                        <div style={{ display: "grid", gap: "var(--space-2)" }}>
                          <input
                            type="search"
                            value={instanceSearch}
                            onChange={(event) => setInstanceSearch(event.target.value)}
                            placeholder="Search domain, software, country"
                            aria-label="Search instances"
                            style={{
                              width: "100%",
                              minHeight: "var(--touch-min)",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)",
                              background: "var(--color-bg)",
                              color: "var(--color-text)",
                              padding: "0 var(--space-3)",
                              fontSize: "var(--text-body)"
                            }}
                          />
                          <select
                            value={preferredSoftware}
                            onChange={(event) => setPreferredSoftware(event.target.value)}
                            aria-label="Preferred software"
                            style={{
                              minHeight: "var(--touch-min)",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)",
                              background: "var(--color-bg)",
                              color: "var(--color-text)",
                              padding: "0 var(--space-2)"
                            }}
                          >
                            <option value="bookwyrm">Prefer BookWyrm</option>
                            <option value="mastodon">Prefer Mastodon</option>
                            <option value="">No preference</option>
                          </select>
                          <select
                            value={preferredCountry}
                            onChange={(event) => setPreferredCountry(event.target.value)}
                            aria-label="Preferred country"
                            style={{
                              minHeight: "var(--touch-min)",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)",
                              background: "var(--color-bg)",
                              color: "var(--color-text)",
                              padding: "0 var(--space-2)"
                            }}
                          >
                            <option value="">Any country</option>
                            {availableCountries.map((country) => (
                              <option key={country} value={country}>{country}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ overflowY: "auto", display: "grid", gap: "var(--space-2)", paddingRight: "var(--space-1)" }}>
                          {signupInstances.map((instance) => (
                            <article
                              key={instance.domain}
                              style={{
                                borderRadius: "var(--radius-md)",
                                background: "var(--color-bg-secondary)",
                                color: "var(--color-text)",
                                padding: "var(--space-2) var(--space-3)",
                                textAlign: "left",
                                display: "grid",
                                gap: "var(--space-2)"
                              }}
                            >
                              <div style={{ display: "grid", gap: "2px" }}>
                                <span style={{ fontWeight: 700 }}>{instance.domain}</span>
                                <span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-caption1)" }}>
                                  {instance.softwareName ?? "Fediverse"}
                                  {instance.country ? ` · ${instance.country}` : ""}
                                  {typeof instance.userCount === "number" ? ` · ${instance.userCount.toLocaleString()} users` : ""}
                                </span>
                              </div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                                <button
                                  type="button"
                                  onClick={() => applyDiscoveredInstance(instance.domain)}
                                  style={{
                                    border: 0,
                                    borderRadius: "var(--radius-sm)",
                                    minHeight: "calc(var(--touch-min) - 8px)",
                                    background: "var(--color-accent)",
                                    color: "white",
                                    padding: "0 var(--space-3)",
                                    fontSize: "var(--text-footnote)",
                                    fontWeight: 600
                                  }}
                                >
                                  Use this server
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openInstanceSite(instance.url)}
                                  style={{
                                    border: "1px solid color-mix(in srgb, var(--color-text) 14%, transparent)",
                                    borderRadius: "var(--radius-sm)",
                                    minHeight: "calc(var(--touch-min) - 8px)",
                                    background: "transparent",
                                    color: "var(--color-text)",
                                    padding: "0 var(--space-3)",
                                    fontSize: "var(--text-footnote)",
                                    fontWeight: 600
                                  }}
                                >
                                  Open site
                                </button>
                              </div>
                            </article>
                          ))}
                          {!signupInstancesLoading && signupInstances.length === 0 ? (
                            <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>No matches for current filters.</p>
                          ) : null}
                        </div>
                        <p style={{ margin: 0, color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
                          Only open-registration instances are shown. Oliphant Tier 0 domains are excluded.
                        </p>
                      </section>
                    </div>
                  ) : null}
                </TabPanel>
              )}
            </AnimatePresence>

            {activeNowReadingStatus ? (
              <NowReadingPostSheet
                status={activeNowReadingStatus}
                importedBooks={importedBooks}
                onClose={() => setActiveNowReadingStatus(null)}
                onOpenProfile={(status) => {
                  setActiveNowReadingStatus(null);
                  openReaderProfile(status);
                }}
              />
            ) : null}

            {activeReaderProfile ? (
              <ReaderProfileSheet
                profile={activeReaderProfile}
                onClose={() => setActiveReaderProfile(null)}
              />
            ) : null}
          </main>
          <AppTabBar activeTab={activeTab} onChange={changeTab} />
        </div>
      </ErrorBoundary>
    </MotionConfig>
  );
}
