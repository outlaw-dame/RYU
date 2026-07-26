import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ReviewDoc } from "../../db/schema";
import {
  buildUserSignalScopeFromSession,
  listReviewerTrustOptions,
  type ReviewerTrustManagementSnapshot,
  type ReviewerTrustState
} from "../../recommendations";
import {
  setSharedReviewerTrustState,
  subscribeSharedReviewerTrust
} from "../../recommendations/reviewer-trust-manager-registry";
import { getVerifiedReviewerAttribution } from "../../reviews/reviewer-attribution";
import { useMastodonSession } from "../../sync/use-mastodon-activity";

const OPTIONS = Object.freeze(listReviewerTrustOptions().map((option) => Object.freeze(option)));

export function ReviewerTrustControl({ review }: { review: ReviewDoc }) {
  const { t } = useTranslation();
  const sessionQuery = useMastodonSession();
  const reviewerAccountId = review.reviewerAccountId;
  const reviewerAttributionSource = review.reviewerAttributionSource;
  const connected = sessionQuery.data?.connected;
  const instanceOrigin = sessionQuery.data?.instanceOrigin;
  const ownerAccountId = sessionQuery.data?.account?.id;

  const attribution = useMemo(
    () => getVerifiedReviewerAttribution({ reviewerAccountId, reviewerAttributionSource }),
    [reviewerAccountId, reviewerAttributionSource]
  );
  const scope = useMemo(
    () => buildUserSignalScopeFromSession({
      connected,
      instanceOrigin,
      account: ownerAccountId ? { id: ownerAccountId } : null
    }),
    [connected, instanceOrigin, ownerAccountId]
  );
  const [snapshot, setSnapshot] = useState<ReviewerTrustManagementSnapshot | null>(null);

  useEffect(() => {
    if (!attribution || !scope) {
      setSnapshot(null);
      return;
    }
    return subscribeSharedReviewerTrust(scope, attribution.accountId, setSnapshot);
  }, [attribution?.accountId, scope?.instanceOrigin, scope?.ownerAccountId]);

  if (!attribution || !scope || !snapshot) return null;
  const pending = snapshot.status === "loading" || snapshot.status === "saving";

  const selectState = async (state: ReviewerTrustState) => {
    await setSharedReviewerTrustState(scope, attribution.accountId, state);
  };

  return (
    <div style={{ display: "grid", justifyItems: "end", gap: "var(--space-1)" }}>
      <details>
        <summary
          aria-label={t("reviewTrust.menuAria")}
          style={{
            cursor: pending ? "wait" : "pointer",
            color: "var(--color-text-tertiary)",
            fontSize: "var(--text-caption2)",
            padding: "var(--space-1) var(--space-2)",
            borderRadius: "var(--radius-sm)",
            listStyle: "none",
            userSelect: "none"
          }}
        >
          {pending
            ? t("reviewTrust.saving")
            : t("reviewTrust.current", { state: t(`reviewTrust.states.${snapshot.state}`) })}
        </summary>
        <div
          role="menu"
          aria-label={t("reviewTrust.menuLabel")}
          style={{
            display: "grid",
            minWidth: 230,
            marginTop: "var(--space-1)",
            padding: "var(--space-1)",
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md)",
            position: "absolute",
            right: "var(--space-4)",
            zIndex: 3
          }}
        >
          {OPTIONS.map((option) => (
            <button
              key={option.state}
              type="button"
              role="menuitemradio"
              aria-checked={snapshot.state === option.state}
              disabled={pending}
              title={t(`reviewTrust.descriptions.${option.state}`)}
              onClick={() => void selectState(option.state)}
              style={{
                border: "none",
                background: snapshot.state === option.state
                  ? "color-mix(in srgb, var(--color-accent) 10%, transparent)"
                  : "none",
                color: option.destructive
                  ? "var(--color-danger, var(--color-text))"
                  : "var(--color-text)",
                textAlign: "left",
                padding: "var(--space-2)",
                borderRadius: "var(--radius-sm)",
                cursor: pending ? "wait" : "pointer",
                fontSize: "var(--text-caption1)"
              }}
            >
              {t(`reviewTrust.states.${option.state}`)}
            </button>
          ))}
        </div>
      </details>
      {snapshot.status === "error" && (
        <span role="status" style={{ color: "var(--color-danger, var(--color-text-secondary))", fontSize: "var(--text-caption2)" }}>
          {t("reviewTrust.saveError")}
        </span>
      )}
    </div>
  );
}
