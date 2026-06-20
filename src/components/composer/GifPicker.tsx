/**
 * GIF Picker — search and select GIFs/stickers via Klipy API.
 *
 * Renders a search input + scrollable grid of results.
 * Shows trending GIFs initially, then search results on query input.
 * Selected GIF is passed to the parent via onSelect callback.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { searchKlipy, trendingKlipy, isKlipyConfigured, type KlipyResult } from "../../gif";

export interface GifPickerProps {
  /** Called when user selects a GIF. */
  onSelect: (gif: KlipyResult) => void;
  /** Called to close the picker. */
  onClose: () => void;
  /** Whether to show the picker. */
  open: boolean;
}

export function GifPicker({ onSelect, onClose, open }: GifPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KlipyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const configured = isKlipyConfigured();

  // Load trending on open
  useEffect(() => {
    if (!open || !configured) return;
    if (query.trim()) return; // Don't load trending if there's a search query

    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    trendingKlipy({ limit: 24, signal: controller.signal })
      .then(setResults)
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => { controller.abort(); };
  }, [open, configured, query]);

  // Debounced search
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!value.trim()) return;

    debounceRef.current = setTimeout(() => {
      setLoading(true);
      const controller = new AbortController();
      abortRef.current = controller;

      searchKlipy({ query: value.trim(), limit: 24, signal: controller.signal })
        .then(setResults)
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 300);
  }, []);

  if (!open) return null;

  if (!configured) {
    return (
      <div style={{
        padding: "var(--space-4)",
        textAlign: "center",
        color: "var(--color-text-secondary)",
        fontSize: "var(--text-footnote)"
      }}>
        {t("gif.notConfigured")}
      </div>
    );
  }

  return (
    <div style={{
      display: "grid",
      gap: "var(--space-2)",
      maxHeight: "360px",
      overflow: "hidden"
    }}>
      {/* Search input */}
      <div style={{ padding: "0 var(--space-2)" }}>
        <input
          type="search"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={t("gif.searchPlaceholder")}
          aria-label={t("gif.searchLabel")}
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
      </div>

      {/* Results grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
        gap: "var(--space-1)",
        overflowY: "auto",
        maxHeight: "290px",
        padding: "0 var(--space-2) var(--space-2)"
      }}>
        {loading && results.length === 0 ? (
          <div style={{
            gridColumn: "1 / -1",
            padding: "var(--space-4)",
            textAlign: "center",
            color: "var(--color-text-tertiary)",
            fontSize: "var(--text-footnote)"
          }}>
            {t("gif.loading")}
          </div>
        ) : results.length === 0 && query.trim() ? (
          <div style={{
            gridColumn: "1 / -1",
            padding: "var(--space-4)",
            textAlign: "center",
            color: "var(--color-text-tertiary)",
            fontSize: "var(--text-footnote)"
          }}>
            {t("gif.noResults")}
          </div>
        ) : (
          results.map((gif) => (
            <button
              key={gif.id}
              type="button"
              onClick={() => { onSelect(gif); onClose(); }}
              aria-label={gif.title || t("gif.selectGif")}
              style={{
                border: 0,
                padding: 0,
                borderRadius: "var(--radius-sm)",
                overflow: "hidden",
                cursor: "pointer",
                aspectRatio: "1",
                background: "var(--color-bg-secondary)"
              }}
            >
              <img
                src={gif.previewUrl}
                alt={gif.title}
                loading="lazy"
                decoding="async"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </button>
          ))
        )}
      </div>

      {/* Klipy attribution */}
      <div style={{
        padding: "var(--space-1) var(--space-2)",
        textAlign: "center",
        fontSize: "var(--text-caption1)",
        color: "var(--color-text-tertiary)"
      }}>
        {t("gif.poweredBy")}
      </div>
    </div>
  );
}
