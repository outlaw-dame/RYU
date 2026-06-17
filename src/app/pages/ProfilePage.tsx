/**
 * Phase 23 — Profile Page component.
 *
 * The Profile tab showing the user's connected account details,
 * authentication controls, and account management.
 */

import { useTranslation } from "react-i18next";
import { PageShell } from "../../components/layout/PageShell";
import { EmptyState } from "../../components/common/EmptyState";
import type { MastodonAccountFull } from "../../sync/mastodon-client";


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
      <section style={{ padding: "0 var(--space-4)", display: "grid", gap: "var(--space-4)" }}>
        {connectedAccount ? renderConnectedProfile() : renderAuthForm()}
        {authInfo ? (
          <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-footnote)" }}>
            {authInfo}
          </p>
        ) : null}
        {authError ? (
          <p style={{ margin: 0, color: "#c23b3b", fontSize: "var(--text-footnote)" }}>
            {authError}
          </p>
        ) : null}
      </section>
      {!connectedAccount ? (
        <EmptyState
          title={t("auth.backendExchangeTitle")}
          description={t("auth.backendExchangeDescription")}
        />
      ) : null}
    </PageShell>
  );
}
