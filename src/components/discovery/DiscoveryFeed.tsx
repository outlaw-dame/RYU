/**
 * Phase 34 - DiscoveryFeed component.
 *
 * Renders the discovery feed with recommendations, user controls,
 * and empty/loading states.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { useDiscovery } from "../../hooks/useDiscovery";
import { RecommendationCard } from "./RecommendationCard";

export type DiscoveryFeedProps = {
  /** Specific edition to find related books for. */
  editionId?: string | null;
  /** Maximum recommendations to display. */
  limit?: number;
  /** Called when the user selects a recommendation. */
  onSelect?: (id: string) => void;
  /** Whether to show the controls section. */
  showControls?: boolean;
};

export function DiscoveryFeed({
  editionId,
  limit = 12,
  onSelect,
  showControls = false
}: DiscoveryFeedProps) {
  const { t } = useTranslation();
  const {
    recommendations,
    loading,
    error,
    enabled,
    setEnabled,
    excludeItem,
    reset
  } = useDiscovery({ editionId, limit });

  if (!enabled) {
    return (
      <div style={{ padding: "var(--space-6) var(--space-4)", textAlign: "center" }}>
        <p style={{
          margin: 0,
          color: "var(--color-text-secondary)",
          fontSize: "var(--text-footnote)"
        }}>
          {t("discovery.disabled")}
        </p>
        <button
          type="button"
          onClick={() => setEnabled(true)}
          style={{
            marginTop: "var(--space-3)",
            border: "none",
            background: "none",
            color: "var(--color-accent)",
            fontSize: "var(--text-caption1)",
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          {t("discovery.enable")}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      {/* Header with controls */}
      {showControls && (
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 var(--space-4)"
        }}>
          <h3 style={{
            margin: 0,
            fontSize: "var(--text-headline)",
            fontWeight: 600,
            color: "var(--color-text)"
          }}>
            {t("discovery.title")}
          </h3>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button
              type="button"
              onClick={reset}
              aria-label={t("discovery.reset")}
              style={{
                border: "none",
                background: "none",
                color: "var(--color-text-tertiary)",
                fontSize: "var(--text-caption2)",
                cursor: "pointer",
                padding: "var(--space-1) var(--space-2)"
              }}
            >
              {t("discovery.reset")}
            </button>
            <button
              type="button"
              onClick={() => setEnabled(false)}
              aria-label={t("discovery.disable")}
              style={{
                border: "none",
                background: "none",
                color: "var(--color-text-tertiary)",
                fontSize: "var(--text-caption2)",
                cursor: "pointer",
                padding: "var(--space-1) var(--space-2)"
              }}
            >
              {t("discovery.disable")}
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && recommendations.length === 0 && (
        <p style={{
          margin: 0,
          padding: "var(--space-4)",
          color: "var(--color-text-secondary)",
          fontSize: "var(--text-footnote)"
        }}>
          {t("discovery.loading")}
        </p>
      )}

      {/* Error state */}
      {error && (
        <p style={{
          margin: 0,
          padding: "var(--space-4)",
          color: "var(--color-text-secondary)",
          fontSize: "var(--text-footnote)"
        }}>
          {t("discovery.error")}
        </p>
      )}

      {/* Empty state */}
      {!loading && !error && recommendations.length === 0 && (
        <p style={{
          margin: 0,
          padding: "var(--space-6) var(--space-4)",
          color: "var(--color-text-secondary)",
          fontSize: "var(--text-footnote)",
          textAlign: "center"
        }}>
          {t("discovery.empty")}
        </p>
      )}

      {/* Recommendations list */}
      {recommendations.length > 0 && (
        <div
          role="feed"
          aria-label={t("discovery.feedLabel")}
          style={{ display: "grid", gap: "var(--space-2)", padding: "0 var(--space-4)" }}
        >
          {recommendations.map((rec) => (
            <RecommendationCard
              key={rec.id}
              recommendation={rec}
              onDismiss={excludeItem}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
