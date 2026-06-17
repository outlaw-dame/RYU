import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));

const settingsMock = vi.hoisted(() => ({
  current: {
    embeddingRuntime: "auto" as string,
    rerankerRuntime: "off" as string,
    webLLMIntentRefinement: false
  }
}));

const flagsMock = vi.hoisted(() => ({
  current: {
    enhanced_search: true,
    progressive_search: true,
    federated_discovery: false,
    personalization: true,
    debug_panel: false,
    pwa_orchestration: true,
    remote_cache_eviction: true
  }
}));

vi.mock("../../search/runtime-settings", () => ({
  getSearchRuntimeSettings: () => ({ ...settingsMock.current }),
  setSearchRuntimeSettings: (patch: Record<string, unknown>) => {
    const next = { ...settingsMock.current, ...patch };
    settingsMock.current = next;
    return next;
  }
}));

vi.mock("../../search/release/featureFlags", () => ({
  getSearchFeatureFlags: () => ({ ...flagsMock.current }),
  setSearchFeatureFlag: (flag: string, value: boolean) => {
    const next = { ...flagsMock.current, [flag]: value };
    flagsMock.current = next;
    return next;
  }
}));

import { PrivacySearchSetup } from "./PrivacySearchSetup";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  settingsMock.current = {
    embeddingRuntime: "auto",
    rerankerRuntime: "off",
    webLLMIntentRefinement: false
  };
  flagsMock.current = {
    enhanced_search: true,
    progressive_search: true,
    federated_discovery: false,
    personalization: true,
    debug_panel: false,
    pwa_orchestration: true,
    remote_cache_eviction: true
  };
});

/** Helper: returns the nth checkbox (0-indexed) from a specific container. */
function renderAndGetCheckboxes() {
  const { container } = render(<PrivacySearchSetup />);
  return container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
}

describe("PrivacySearchSetup", () => {
  it("renders privacy title and description", () => {
    const { container } = render(<PrivacySearchSetup />);

    expect(container.querySelector("h3")?.textContent).toBe("onboarding.privacyTitle");
    expect(container.querySelectorAll("p")[0]?.textContent).toBe("onboarding.privacyDescription");
  });

  it("renders all three toggle checkboxes", () => {
    const checkboxes = renderAndGetCheckboxes();
    expect(checkboxes).toHaveLength(3);
  });

  it("renders privacy footnote", () => {
    const { container } = render(<PrivacySearchSetup />);

    const footnoteDiv = container.querySelector('[style*="color-mix(in srgb, var(--color-accent)"]');
    expect(footnoteDiv?.textContent).toBe("onboarding.privacyFootnote");
  });

  it("shows enhanced search as checked when runtime is auto", () => {
    const checkboxes = renderAndGetCheckboxes();
    expect(checkboxes[0].checked).toBe(true);
  });

  it("shows enhanced search as unchecked when runtime is deterministic", () => {
    settingsMock.current = { ...settingsMock.current, embeddingRuntime: "deterministic" };

    const checkboxes = renderAndGetCheckboxes();
    expect(checkboxes[0].checked).toBe(false);
  });

  it("shows personalization as checked when flag is true", () => {
    const checkboxes = renderAndGetCheckboxes();
    expect(checkboxes[1].checked).toBe(true);
  });

  it("shows federated discovery as unchecked when flag is false", () => {
    const checkboxes = renderAndGetCheckboxes();
    expect(checkboxes[2].checked).toBe(false);
  });

  it("toggles enhanced search on click", () => {
    const checkboxes = renderAndGetCheckboxes();
    fireEvent.click(checkboxes[0]);

    expect(settingsMock.current.embeddingRuntime).toBe("deterministic");
  });

  it("toggles personalization on click", () => {
    const checkboxes = renderAndGetCheckboxes();
    fireEvent.click(checkboxes[1]);

    expect(flagsMock.current.personalization).toBe(false);
  });

  it("toggles federated discovery on click", () => {
    const checkboxes = renderAndGetCheckboxes();
    fireEvent.click(checkboxes[2]);

    expect(flagsMock.current.federated_discovery).toBe(true);
  });
});
