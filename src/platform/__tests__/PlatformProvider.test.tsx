/**
 * Tests for PlatformProvider component
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlatformProvider, usePlatform } from "../PlatformProvider";

// Mock the detectPlatform module
vi.mock("../detectPlatform", () => ({
  detectPlatform: () => ({
    os: "ios" as const,
    theme: "ios" as const,
    deviceClass: "phone" as const,
    displayMode: "browser" as const,
    input: {
      coarsePointer: true,
      hover: false,
      virtualKeyboardLikely: true
    },
    capabilities: {
      safeAreaInsets: true,
      webShare: true,
      badging: false,
      fileSystemAccess: false
    }
  })
}));

describe("PlatformProvider", () => {
  const TestComponent = () => {
    const platform = usePlatform();
    return <div data-testid="platform-os">{platform.os}</div>;
  };

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should provide platform context to children", () => {
    render(
      <PlatformProvider>
        <TestComponent />
      </PlatformProvider>
    );

    expect(screen.getByTestId("platform-os")).toHaveTextContent("ios");
  });

  it("should set data attributes on root element", () => {
    render(
      <PlatformProvider>
        <div>Test</div>
      </PlatformProvider>
    );

    const root = document.documentElement;
    expect(root.dataset.os).toBe("ios");
    expect(root.dataset.device).toBe("phone");
    expect(root.dataset.displayMode).toBe("browser");
  });

  it("should throw error when usePlatform is used outside PlatformProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const ComponentOutsideProvider = () => {
      const platform = usePlatform();
      return <div>{platform.os}</div>;
    };

    expect(() => {
      render(<ComponentOutsideProvider />);
    }).toThrow("usePlatform must be used within a PlatformProvider");

    consoleError.mockRestore();
  });
});
