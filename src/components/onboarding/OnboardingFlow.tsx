/**
 * Phase 25 - OnboardingFlow component.
 *
 * Production-ready first-run and account connection experience.
 * Shows a welcome state for new users, explains what RYU is,
 * provides instance selection with search/filtering, login flow
 * with clear error states, permission explanation, and import options.
 */

import { useTranslation } from "react-i18next";
import type { FediverseInstance } from "../../sync/instance-discovery";
import type { ConnectedAccountInfo } from "../../hooks/useAccountConnection";

export interface OnboardingFlowProps {
  /** Current instance input value. */
  instanceInput: string;
  /** Update instance input. */
  onInstanceInputChange: (value: string) => void;
  /** Whether the OAuth flow is in progress. */
  isWorking: boolean;
  /** User-facing error from the auth flow. */
  error: string | null;
  /** Informational message. */
  info: string | null;
  /** Start the login flow. */
  onStartLogin: () => void;
  /** Open the instance picker. */
  onOpenPicker: () => void;
  /** Clear the current error. */
  onClearError: () => void;
  /** Retry the last action. */
  onRetry: () => void;
  /** Autocomplete instance suggestions. */
  autocompleteSuggestions: FediverseInstance[];
  /** Connected account (null when not connected). */
  connectedAccount: ConnectedAccountInfo | null;
  /** Disconnect account handler. */
  onDisconnect: () => void;
  /** Whether disconnect is in progress. */
  isDisconnecting: boolean;
}

const INSTANCE_DATALIST_ID = "onboarding-instance-suggestions";

export function OnboardingFlow({
  instanceInput,
  onInstanceInputChange,
  isWorking,
  error,
  info,
  onStartLogin,
  onOpenPicker,
  onClearError,
  onRetry,
  autocompleteSuggestions,
  connectedAccount,
  onDisconnect,
  isDisconnecting
}: OnboardingFlowProps) {
  const { t } = useTranslation();

  if (connectedAccount) {
    return <ConnectedState account={connectedAccount} onDisconnect={onDisconnect} isDisconnecting={isDisconnecting} />;
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      <WelcomeSection />
      <SignInSection
        instanceInput={instanceInput}
        onInstanceInputChange={onInstanceInputChange}
        isWorking={isWorking}
        onStartLogin={onStartLogin}
        onOpenPicker={onOpenPicker}
        autocompleteSuggestions={autocompleteSuggestions}
      />
      <PermissionExplanation />
      {error ? (
        <ErrorNotice error={error} onClearError={onClearError} onRetry={onRetry} />
      ) : null}
      {info ? (
        <p
          role="status"
          style={{
            margin: 0,
            color: "var(--color-text-secondary)",
            fontSize: "var(--text-footnote)",
            padding: "0 var(--space-1)"
          }}
        >
          {info}
        </p>
      ) : null}
    </div>
  );
}

function WelcomeSection() {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: "grid",
        gap: "var(--space-2)",
        padding: "var(--space-4)",
        borderRadius: "var(--radius-lg)",
        background: "color-mix(in srgb, var(--color-accent) 6%, var(--color-bg))",
        border: "1px solid color-mix(in srgb, var(--color-accent) 14%, transparent)"
      }}
    >
      <h2
        style={{
          margin: 0,
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-title3)",
          color: "var(--color-text)"
        }}
      >
        {t("onboarding.welcomeTitle")}
      </h2>
      <p
        style={{
          margin: 0,
          color: "var(--color-text-secondary)",
          fontSize: "var(--text-subhead)",
          lineHeight: 1.4
        }}
      >
        {t("onboarding.welcomeDescription")}
      </p>
      <ul
        style={{
          margin: 0,
          padding: "0 0 0 var(--space-4)",
          color: "var(--color-text-secondary)",
          fontSize: "var(--text-footnote)",
          lineHeight: 1.5,
          display: "grid",
          gap: "var(--space-1)"
        }}
      >
        <li>{t("onboarding.welcomePoint1")}</li>
        <li>{t("onboarding.welcomePoint2")}</li>
        <li>{t("onboarding.welcomePoint3")}</li>
      </ul>
    </div>
  );
}

function SignInSection({
  instanceInput,
  onInstanceInputChange,
  isWorking,
  onStartLogin,
  onOpenPicker,
  autocompleteSuggestions
}: {
  instanceInput: string;
  onInstanceInputChange: (value: string) => void;
  isWorking: boolean;
  onStartLogin: () => void;
  onOpenPicker: () => void;
  autocompleteSuggestions: FediverseInstance[];
}) {
  const { t } = useTranslation();

  return (
    <form
      onSubmit={(event) => { event.preventDefault(); if (!isWorking && instanceInput.trim()) onStartLogin(); }}
      style={{
        display: "grid",
        gap: "var(--space-3)",
        padding: "var(--space-4)",
        borderRadius: "var(--radius-md)",
        background: "var(--color-bg)",
        border: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)"
      }}
    >
      <div style={{ display: "grid", gap: "var(--space-1)" }}>
        <h3
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-headline)",
            color: "var(--color-text)"
          }}
        >
          {t("onboarding.connectTitle")}
        </h3>
        <p
          style={{
            margin: 0,
            color: "var(--color-text-secondary)",
            fontSize: "var(--text-footnote)",
            lineHeight: 1.4
          }}
        >
          {t("onboarding.connectDescription")}
        </p>
      </div>
      <input
        type="text"
        value={instanceInput}
        onChange={(event) => onInstanceInputChange(event.target.value)}
        placeholder={t("auth.instancePlaceholder")}
        aria-label={t("auth.instanceAriaLabel")}
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
        {autocompleteSuggestions.slice(0, 20).map((instance) => (
          <option
            key={instance.domain}
            value={instance.domain}
            label={instance.softwareName ?? "Fediverse"}
          />
        ))}
      </datalist>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <button
          type="submit"
          disabled={isWorking || !instanceInput.trim()}
          style={{
            minHeight: "var(--touch-min)",
            border: 0,
            borderRadius: "var(--radius-md)",
            background: "var(--color-accent)",
            color: "white",
            fontWeight: 700,
            padding: "0 var(--space-4)",
            opacity: isWorking || !instanceInput.trim() ? 0.6 : 1
          }}
        >
          {isWorking ? t("shared.working") : t("auth.signInWithServer")}
        </button>
        <button
          type="button"
          onClick={onOpenPicker}
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
          {t("auth.findServer")}
        </button>
      </div>
    </form>
  );
}

function PermissionExplanation() {
  const { t } = useTranslation();

  return (
    <section
      style={{
        display: "grid",
        gap: "var(--space-2)",
        padding: "var(--space-3) var(--space-4)",
        borderRadius: "var(--radius-md)",
        background: "var(--color-bg-secondary)",
        border: "1px solid color-mix(in srgb, var(--color-text) 6%, transparent)"
      }}
    >
      <h4
        style={{
          margin: 0,
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-subhead)",
          color: "var(--color-text)"
        }}
      >
        {t("onboarding.permissionsTitle")}
      </h4>
      <ul
        style={{
          margin: 0,
          padding: "0 0 0 var(--space-4)",
          color: "var(--color-text-secondary)",
          fontSize: "var(--text-footnote)",
          lineHeight: 1.5,
          display: "grid",
          gap: "var(--space-1)"
        }}
      >
        <li>{t("onboarding.permissionRead")}</li>
        <li>{t("onboarding.permissionNotifications")}</li>
        <li>{t("onboarding.permissionOptionalWrite")}</li>
      </ul>
      <p
        style={{
          margin: 0,
          color: "var(--color-text-tertiary)",
          fontSize: "var(--text-caption1)",
          lineHeight: 1.4
        }}
      >
        {t("onboarding.permissionsFootnote")}
      </p>
    </section>
  );
}

function ErrorNotice({
  error,
  onClearError,
  onRetry
}: {
  error: string;
  onClearError: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      style={{
        display: "grid",
        gap: "var(--space-2)",
        padding: "var(--space-3) var(--space-4)",
        borderRadius: "var(--radius-md)",
        background: "color-mix(in srgb, #c23b3b 8%, var(--color-bg))",
        border: "1px solid color-mix(in srgb, #c23b3b 20%, transparent)"
      }}
    >
      <p style={{ margin: 0, color: "#c23b3b", fontSize: "var(--text-footnote)", lineHeight: 1.4 }}>
        {error}
      </p>
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button
          type="button"
          onClick={onRetry}
          style={{
            border: "1px solid color-mix(in srgb, #c23b3b 30%, transparent)",
            borderRadius: "var(--radius-sm)",
            background: "transparent",
            color: "var(--color-text)",
            fontSize: "var(--text-footnote)",
            fontWeight: 600,
            padding: "4px var(--space-3)",
            minHeight: "calc(var(--touch-min) - 12px)"
          }}
        >
          {t("onboarding.tryAgain")}
        </button>
        <button
          type="button"
          onClick={onClearError}
          style={{
            border: 0,
            borderRadius: "var(--radius-sm)",
            background: "transparent",
            color: "var(--color-text-secondary)",
            fontSize: "var(--text-footnote)",
            padding: "4px var(--space-3)",
            minHeight: "calc(var(--touch-min) - 12px)"
          }}
        >
          {t("onboarding.dismiss")}
        </button>
      </div>
    </div>
  );
}

function ConnectedState({
  account,
  onDisconnect,
  isDisconnecting
}: {
  account: ConnectedAccountInfo;
  onDisconnect: () => void;
  isDisconnecting: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: "grid",
        gap: "var(--space-3)",
        padding: "var(--space-4)",
        borderRadius: "var(--radius-lg)",
        background: "var(--color-bg-secondary)",
        border: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        {account.avatar ? (
          <img
            src={account.avatar}
            alt={t("account.avatarAlt", { name: account.displayName ?? account.acct })}
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              objectFit: "cover"
            }}
          />
        ) : null}
        <div style={{ display: "grid", gap: "2px" }}>
          {account.displayName ? (
            <span style={{ fontWeight: 700, fontSize: "var(--text-headline)", color: "var(--color-text)" }}>
              {account.displayName}
            </span>
          ) : null}
          <span style={{ fontSize: "var(--text-footnote)", color: "var(--color-text-secondary)" }}>
            {account.acct}
          </span>
        </div>
      </div>
      <div style={{ display: "grid", gap: "var(--space-1)" }}>
        <span style={{ fontSize: "var(--text-footnote)", color: "var(--color-text-secondary)" }}>
          {t("onboarding.connectedTo", { instance: account.instanceOrigin.replace(/^https?:\/\//, "") })}
        </span>
        {account.grantedScopes && account.grantedScopes.length > 0 ? (
          <span style={{ fontSize: "var(--text-caption1)", color: "var(--color-text-tertiary)" }}>
            {t("onboarding.scopesGranted", { scopes: account.grantedScopes.join(", ") })}
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={isDisconnecting}
          style={{
            minHeight: "var(--touch-min)",
            border: "1px solid color-mix(in srgb, var(--color-text) 20%, transparent)",
            borderRadius: "var(--radius-md)",
            background: "transparent",
            color: "var(--color-text)",
            fontWeight: 600,
            padding: "0 var(--space-4)",
            opacity: isDisconnecting ? 0.6 : 1
          }}
        >
          {isDisconnecting ? t("account.signingOut") : t("account.signOut")}
        </button>
      </div>
    </div>
  );
}
