/** Discovery feed with reachable recommendation controls. */

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDiscovery } from "../../hooks/useDiscovery";
import type { ScoredRecommendation } from "../../recommendations/unified-scorer";
import { RecommendationCard } from "./RecommendationCard";
import { RecommendationControlSheet } from "./RecommendationControlSheet";

export type DiscoveryFeedProps = {
  editionId?: string | null;
  limit?: number;
  onSelect?: (id: string) => void;
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
    reset
  } = useDiscovery({ editionId, limit });
  const [controlledRecommendation, setControlledRecommendation] = useState<ScoredRecommendation | null>(null);

  if (!enabled) {
    return (
      <div style={{ padding: "var(--space-6) var(--space-4)", textAlign: "center" }}>
        <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
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
      {showControls && (
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 var(--space-4)"
        }}>
          <h3 style={{ margin: 0, fontSize: "var(--text-headline)", fontWeight: 600, color: "var(--color-text)" }}>
            {t("discovery.title")}
          </h3>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button type="button" onClick={reset} aria-label={t("discovery.reset")}>
              {t("discovery.reset")}
            </button>
            <button type="button" onClick={() => setEnabled(false)} aria-label={t("discovery.disable")}>
              {t("discovery.disable")}
            </button>
          </div>
        </div>
      )}

      {loading && recommendations.length === 0 && <p style={{ padding: "var(--space-4)" }}>{t("discovery.loading")}</p>}
      {error && <p style={{ padding: "var(--space-4)" }}>{t("discovery.error")}</p>}
      {!loading && !error && recommendations.length === 0 && (
        <p style={{ padding: "var(--space-6) var(--space-4)", textAlign: "center" }}>
          {t("discovery.empty")}
        </p>
      )}

      {recommendations.length > 0 && (
        <div
          role="feed"
          aria-label={t("discovery.feedLabel")}
          style={{ display: "grid", gap: "var(--space-2)", padding: "0 var(--space-4)" }}
        >
          {recommendations.map((recommendation) => (
            <RecommendationCard
              key={recommendation.id}
              recommendation={recommendation}
              onControls={setControlledRecommendation}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}

      {controlledRecommendation && (
        <RecommendationControlSheet
          recommendation={controlledRecommendation}
          open
          onClose={() => setControlledRecommendation(null)}
        />
      )}
    </div>
  );
}
