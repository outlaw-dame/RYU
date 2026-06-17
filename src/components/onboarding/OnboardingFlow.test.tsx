import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => {
      if (opts) {
        let result = key;
        for (const [k, v] of Object.entries(opts)) {
          result = result.replace(`{{${k}}}`, v);
        }
        return result;
      }
      return key;
    }
  })
}));

import { OnboardingFlow, type OnboardingFlowProps } from "./OnboardingFlow";

afterEach(() => {
  cleanup();
});

function defaultProps(overrides: Partial<OnboardingFlowProps> = {}): OnboardingFlowProps {
  return {
    instanceInput: "",
    onInstanceInputChange: vi.fn(),
    isWorking: false,
    error: null,
    info: null,
    onStartLogin: vi.fn(),
    onOpenPicker: vi.fn(),
    onClearError: vi.fn(),
    onRetry: vi.fn(),
    autocompleteSuggestions: [],
    connectedAccount: null,
    onDisconnect: vi.fn(),
    isDisconnecting: false,
    ...overrides
  };
}

describe("OnboardingFlow", () => {
  it("renders welcome section when not connected", () => {
    render(<OnboardingFlow {...defaultProps()} />);

    expect(screen.getByText("onboarding.welcomeTitle")).toBeInTheDocument();
    expect(screen.getByText("onboarding.welcomeDescription")).toBeInTheDocument();
  });

  it("renders sign-in section with input and buttons", () => {
    render(<OnboardingFlow {...defaultProps()} />);

    expect(screen.getByText("onboarding.connectTitle")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("auth.signInWithServer")).toBeInTheDocument();
    expect(screen.getByText("auth.findServer")).toBeInTheDocument();
  });

  it("renders permission explanation section", () => {
    render(<OnboardingFlow {...defaultProps()} />);

    expect(screen.getByText("onboarding.permissionsTitle")).toBeInTheDocument();
    expect(screen.getByText("onboarding.permissionRead")).toBeInTheDocument();
  });

  it("disables sign-in button when input is empty", () => {
    render(<OnboardingFlow {...defaultProps()} />);

    const button = screen.getByText("auth.signInWithServer");
    expect(button).toBeDisabled();
  });

  it("enables sign-in button when input has content", () => {
    render(<OnboardingFlow {...defaultProps({ instanceInput: "bookwyrm.social" })} />);

    const button = screen.getByText("auth.signInWithServer");
    expect(button).not.toBeDisabled();
  });

  it("calls onStartLogin when sign-in button is clicked", () => {
    const onStartLogin = vi.fn();
    render(<OnboardingFlow {...defaultProps({ instanceInput: "bookwyrm.social", onStartLogin })} />);

    fireEvent.click(screen.getByText("auth.signInWithServer"));
    expect(onStartLogin).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenPicker when find server button is clicked", () => {
    const onOpenPicker = vi.fn();
    render(<OnboardingFlow {...defaultProps({ onOpenPicker })} />);

    fireEvent.click(screen.getByText("auth.findServer"));
    expect(onOpenPicker).toHaveBeenCalledTimes(1);
  });

  it("displays error notice with retry and dismiss buttons", () => {
    const onRetry = vi.fn();
    const onClearError = vi.fn();
    render(<OnboardingFlow {...defaultProps({ error: "Connection failed", onRetry, onClearError })} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Connection failed")).toBeInTheDocument();
    expect(screen.getByText("onboarding.tryAgain")).toBeInTheDocument();
    expect(screen.getByText("onboarding.dismiss")).toBeInTheDocument();

    fireEvent.click(screen.getByText("onboarding.tryAgain"));
    expect(onRetry).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("onboarding.dismiss"));
    expect(onClearError).toHaveBeenCalledTimes(1);
  });

  it("displays info message", () => {
    render(<OnboardingFlow {...defaultProps({ info: "OAuth fallback active" })} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("OAuth fallback active")).toBeInTheDocument();
  });

  it("shows connected state when account is present", () => {
    const account = {
      instanceOrigin: "https://bookwyrm.social",
      acct: "reader@bookwyrm.social",
      displayName: "A Reader",
      avatar: "https://bookwyrm.social/avatar.png",
      grantedScopes: ["read", "write:statuses"]
    };

    render(<OnboardingFlow {...defaultProps({ connectedAccount: account })} />);

    expect(screen.getByText("A Reader")).toBeInTheDocument();
    expect(screen.getByText("reader@bookwyrm.social")).toBeInTheDocument();
    expect(screen.getByText("account.signOut")).toBeInTheDocument();
  });

  it("calls onDisconnect when sign out is clicked in connected state", () => {
    const onDisconnect = vi.fn();
    const account = {
      instanceOrigin: "https://bookwyrm.social",
      acct: "reader@bookwyrm.social"
    };

    render(<OnboardingFlow {...defaultProps({ connectedAccount: account, onDisconnect })} />);

    fireEvent.click(screen.getByText("account.signOut"));
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it("shows working state on sign-in button", () => {
    render(<OnboardingFlow {...defaultProps({ instanceInput: "test.social", isWorking: true })} />);

    const button = screen.getByText("shared.working");
    expect(button).toBeDisabled();
  });

  it("does not render error when null", () => {
    render(<OnboardingFlow {...defaultProps()} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not render info when null", () => {
    render(<OnboardingFlow {...defaultProps()} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
