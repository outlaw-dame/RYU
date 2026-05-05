// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { renderFediverseRichText } from "./fediverse-rich-text";

function setNavigatorPlatform(platform: string, userAgent: string): void {
  Object.defineProperty(navigator, "userAgentData", {
    value: undefined,
    configurable: true
  });
  Object.defineProperty(navigator, "platform", {
    value: platform,
    configurable: true
  });
  Object.defineProperty(navigator, "userAgent", {
    value: userAgent,
    configurable: true
  });
}

afterEach(() => {
  setNavigatorPlatform("", "Vitest");
});

describe("renderFediverseRichText emoji rendering", () => {
  it("keeps native unicode emoji on Apple platforms", () => {
    setNavigatorPlatform("iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");

    const emoji = "\u{1F600}";
    const result = renderFediverseRichText(`Reading ${emoji}`);

    expect(result.html).toContain(`Reading ${emoji}`);
    expect(result.html).not.toContain("twemoji");
  });

  it("uses Twemoji assets on non-Apple platforms", () => {
    setNavigatorPlatform("Linux armv8l", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36");

    const result = renderFediverseRichText("Reading \u{1F600}");

    expect(result.html).toContain("twemoji");
    expect(result.html).toContain("cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f600.svg");
  });

  it("preserves custom Fediverse emoji images on Apple platforms", () => {
    setNavigatorPlatform("MacIntel", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15");

    const result = renderFediverseRichText("Hi :blob:", {
      customEmoji: new Map([["blob", "https://example.com/blob.png"]])
    });

    expect(result.html).toContain("mfm-emoji");
    expect(result.html).toContain("https://example.com/blob.png");
    expect(result.html).not.toContain("twemoji");
  });
});
