/**
 * Phase 25 - PrivacySearchSetup component.
 *
 * Explains enhanced search vs basic search without jargon,
 * allows opt-in/opt-out of AI-powered search features,
 * shows storage implications, and references Phase 22 feature flags.
 */

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getSearchRuntimeSettings,
  setSearchRuntimeSettings,
  type SearchRuntimeSettings
} from "../../search/runtime-settings";
import {
  getSearchFeatureFlags,
  setSearchFeatureFlag,
  type SearchFeatureFlags
} from "../../search/release/featureFlags";

export function PrivacySearchSetup() {
  const { t } = useTranslation();
  const [settings, setSettingsLocal] = useState<SearchRuntimeSettings>(
    () => getSearchRuntimeSettings()
  );
  const [flags, setFlagsLocal] = useState<SearchFeatureFlags>(
    () => getSearchFeatureFlags()
  );

  const updateEnhancedSearch = useCallback((enabled: boolean) => {
    const next = setSearchRuntimeSettings({
      embeddingRuntime: enabled ? "auto" : "deterministic"
    });
    setSettingsLocal(next);
    // Apply immediately so the active provider changes this session.
    // Dynamic import avoids circular dependency with runtime-configure.
    void import("../../search/runtime-configure").then(({ applySearchRuntimeSettings }) => {
      applySearchRuntimeSettings(next);
    });
  }, []);

  const updatePersonalization = useCallback((enabled: boolean) => {
    const next = setSearchFeatureFlag("personalization", enabled);
    setFlagsLocal(next);
  }, []);

  const updateFederatedDiscovery = useCallback((enabled: boolean) => {
    const next = setSearchFeatureFlag("federated_discovery", enabled);
    setFlagsLocal(next);
  }, []);

  const enhancedEnabled = settings.embeddingRuntime !== "deterministic";
  const personalizationEnabled = flags.personalization;
  const federatedEnabled = flags.federated_discovery;

  return (
    <section
      style={{
        display: "grid",
        gap: "var(--space-4)",
        padding: "var(--space-4)",
        borderRadius: "var(--radius-lg)",
        background: "var(--color-bg-secondary)",
        border: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)"
      }}
    >
      <div style={{ display: "grid", gap: "var(--space-1)" }}>
        <h3
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-title3)",
            color: "var(--color-text)"
          }}
        >
          {t("onboarding.privacyTitle")}
        </h3>
        <p
          style={{
            margin: 0,
            color: "var(--color-text-secondary)",
            fontSize: "var(--text-footnote)",
            lineHeight: 1.4
          }}
        >
          {t("onboarding.privacyDescription")}
        </p>
      </div>

      <PrivacyToggle
        label={t("onboarding.enhancedSearchLabel")}
        description={t("onboarding.enhancedSearchDescription")}
        checked={enhancedEnabled}
        onChange={updateEnhancedSearch}
      />

      <PrivacyToggle
        label={t("onboarding.personalizationLabel")}
        description={t("onboarding.personalizationDescription")}
        checked={personalizationEnabled}
        onChange={updatePersonalization}
      />

      <PrivacyToggle
        label={t("onboarding.federatedDiscoveryLabel")}
        description={t("onboarding.federatedDiscoveryDescription")}
        checked={federatedEnabled}
        onChange={updateFederatedDiscovery}
      />

      <div
        style={{
          padding: "var(--space-3)",
          borderRadius: "var(--radius-md)",
          background: "color-mix(in srgb, var(--color-accent) 5%, var(--color-bg))",
          border: "1px solid color-mix(in srgb, var(--color-accent) 10%, transparent)"
        }}
      >
        <p
          style={{
            margin: 0,
            color: "var(--color-text-secondary)",
            fontSize: "var(--text-caption1)",
            lineHeight: 1.4
          }}
        >
          {t("onboarding.privacyFootnote")}
        </p>
      </div>
    </section>
  );
}

function PrivacyToggle({
  label,
  description,
  checked,
  onChange
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        padding: "var(--space-2) 0",
        borderBottom: "1px solid color-mix(in srgb, var(--color-text) 6%, transparent)"
      }}
    >
      <span style={{ display: "grid", gap: "2px" }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-subhead)",
            color: "var(--color-text)"
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: "var(--text-caption1)",
            color: "var(--color-text-secondary)",
            lineHeight: 1.35
          }}
        >
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{ width: 24, height: 24, flexShrink: 0 }}
      />
    </label>
  );
}
