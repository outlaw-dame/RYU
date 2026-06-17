/**
 * Phase 25 - Profile Page component.
 *
 * The Profile tab showing either the onboarding flow (for new users)
 * or the connected account profile with management options.
 * Integrates the OnboardingFlow, PrivacySearchSetup, and handles
 * the instance picker dialog.
 */

import { useTranslation } from "react-i18next";
import { PageShell } from "../../components/layout/PageShell";
import { OnboardingFlow } from "../../components/onboarding/OnboardingFlow";
import { PrivacySearchSetup } from "../../components/onboarding/PrivacySearchSetup";
import type { MastodonAccountFull } from "../../sync/mastodon-client";
import type { FediverseInstance } from "../../sync/instance-discovery";


export interface ConnectedAccountInfo {
  instanceOrigin: string;
  acct: string;
  displayName?: string;
  avatar?: string;
  profileUrl?: string;
  grantedScopes?: string[];
}

export interface ProfilePageProps {
  connectedAccount: ConnectedAccountInfo | null;
  mastodonProfile: MastodonAccountFull | null;
  profileLoading: boolean;
  // Auth state
  instanceInput: string;
  onInstanceInputChange: (value: string) => void;
  isAuthWorking: boolean;
  authError: string | null;
  authInfo: string | null;
  // Actions
  onSignIn: () => void;
  onSignup: () => void;
  onDisconnect: () => void;
  onSwitchAccount: () => void;
  onClearError: () => void;
  onRetry: () => void;
  // Instance picker
  onOpenPicker: () => void;
  // Instance suggestions
  autocompleteSuggestions: FediverseInstance[];
  // Render delegates
  renderAuthForm: () => React.ReactNode;
  renderConnectedProfile: () => React.ReactNode;
}


export function ProfilePage({
  connectedAccount,
  mastodonProfile,
  profileLoading,
  instanceInput,
  onInstanceInputChange,
  isAuthWorking,
  authError,
  authInfo,
  onSignIn,
  onSignup,
  onDisconnect,
  onSwitchAccount,
  onClearError,
  onRetry,
  onOpenPicker,
  autocompleteSuggestions,
  renderAuthForm,
  renderConnectedProfile
}: ProfilePageProps) {
  const { t } = useTranslation();

  return (
    <PageShell
      title={t("screen.account")}
      id="panel-profile"
      role="tabpanel"
      aria-labelledby="tab-profile"
    >
      <section style={{ padding: "0 var(--space-4)", display: "grid", gap: "var(--space-5)" }}>
        <OnboardingFlow
          instanceInput={instanceInput}
          onInstanceInputChange={onInstanceInputChange}
          isWorking={isAuthWorking}
          error={authError}
          info={authInfo}
          onStartLogin={onSignIn}
          onOpenPicker={onOpenPicker}
          onClearError={onClearError ?? (() => {})}
          onRetry={onRetry ?? (() => {})}
          autocompleteSuggestions={autocompleteSuggestions ?? []}
          connectedAccount={connectedAccount}
          onDisconnect={onDisconnect}
          isDisconnecting={isAuthWorking}
        />
        <PrivacySearchSetup />
      </section>
    </PageShell>
  );
}
