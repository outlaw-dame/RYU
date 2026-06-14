/**
 * Tests for platform detection utilities
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectOS,
  detectDeviceClass,
  detectDisplayMode,
  detectInputCapabilities,
  detectPlatformCapabilities,
  mapOSToTheme,
  detectPlatform,
  getPlatformDataAttributes
} from "../detectPlatform";

describe("detectPlatform", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("detectOS", () => {
    it("should detect iOS from userAgent", () => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)"
      );
      expect(detectOS()).toBe("ios");
    });

    it("should detect Android from userAgent", () => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
        "Mozilla/5.0 (Linux; Android 12; Pixel 6)"
      );
      expect(detectOS()).toBe("android");
    });

    it("should detect macOS from userAgent", () => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
      );
      Object.defineProperty(navigator, "maxTouchPoints", { value: 0, writable: true, configurable: true });
      expect(detectOS()).toBe("macos");
    });

    it("should detect Windows from userAgent", () => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      );
      expect(detectOS()).toBe("windows");
    });

    it("should detect Linux from userAgent", () => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
        "Mozilla/5.0 (X11; Linux x86_64)"
      );
      expect(detectOS()).toBe("linux");
    });

    it("should return unknown for unrecognized userAgent", () => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue("CustomBrowser/1.0");
      Object.defineProperty(navigator, "maxTouchPoints", { value: 0, writable: true, configurable: true });
      expect(detectOS()).toBe("unknown");
    });
  });

  describe("detectDeviceClass", () => {
    it("should detect phone for small screens", () => {
      Object.defineProperty(window, "innerWidth", { value: 375, writable: true, configurable: true });
      expect(detectDeviceClass()).toBe("phone");
    });

    it("should detect tablet for medium screens", () => {
      Object.defineProperty(window, "innerWidth", { value: 800, writable: true, configurable: true });
      expect(detectDeviceClass()).toBe("tablet");
    });

    it("should detect desktop for large screens", () => {
      Object.defineProperty(window, "innerWidth", { value: 1440, writable: true, configurable: true });
      expect(detectDeviceClass()).toBe("desktop");
    });
  });

  describe("detectDisplayMode", () => {
    it("should detect standalone mode", () => {
      vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
        matches: query === "(display-mode: standalone)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }));
      expect(detectDisplayMode()).toBe("standalone");
    });

    it("should detect browser mode by default", () => {
      vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }));
      expect(detectDisplayMode()).toBe("browser");
    });
  });

  describe("detectInputCapabilities", () => {
    it("should detect touch device", () => {
      vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
        matches: query === "(pointer: coarse)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }));
      const caps = detectInputCapabilities();
      expect(caps.coarsePointer).toBe(true);
      expect(caps.hover).toBe(false);
      expect(caps.virtualKeyboardLikely).toBe(true);
    });

    it("should detect desktop input", () => {
      vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
        matches: query === "(hover: hover)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }));
      const caps = detectInputCapabilities();
      expect(caps.coarsePointer).toBe(false);
      expect(caps.hover).toBe(true);
      expect(caps.virtualKeyboardLikely).toBe(false);
    });
  });

  describe("detectPlatformCapabilities", () => {
    it("should return boolean capability flags", () => {
      const caps = detectPlatformCapabilities();
      expect(typeof caps.safeAreaInsets).toBe("boolean");
      expect(typeof caps.webShare).toBe("boolean");
      expect(typeof caps.badging).toBe("boolean");
      expect(typeof caps.fileSystemAccess).toBe("boolean");
    });
  });

  describe("mapOSToTheme", () => {
    it("should map iOS to ios theme", () => {
      expect(mapOSToTheme("ios")).toBe("ios");
    });

    it("should map iPadOS to ios theme", () => {
      expect(mapOSToTheme("ipados")).toBe("ios");
    });

    it("should map macOS to ios theme", () => {
      expect(mapOSToTheme("macos")).toBe("ios");
    });

    it("should map Android to md theme", () => {
      expect(mapOSToTheme("android")).toBe("md");
    });

    it("should map Windows/Linux/unknown to md theme", () => {
      expect(mapOSToTheme("windows")).toBe("md");
      expect(mapOSToTheme("linux")).toBe("md");
      expect(mapOSToTheme("unknown")).toBe("md");
    });
  });

  describe("detectPlatform", () => {
    it("should return complete platform information", () => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)"
      );
      Object.defineProperty(window, "innerWidth", { value: 375, writable: true, configurable: true });
      vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
        matches: query === "(pointer: coarse)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }));

      const platform = detectPlatform();

      expect(platform.os).toBe("ios");
      expect(platform.theme).toBe("ios");
      expect(platform.deviceClass).toBe("phone");
      expect(platform.displayMode).toBe("browser");
      expect(platform.input.coarsePointer).toBe(true);
    });
  });

  describe("getPlatformDataAttributes", () => {
    it("should return data attributes for root element", () => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)"
      );
      Object.defineProperty(window, "innerWidth", { value: 375, writable: true, configurable: true });
      vi.spyOn(window, "matchMedia").mockImplementation(() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }));

      const attrs = getPlatformDataAttributes();

      expect(attrs.os).toBe("ios");
      expect(attrs.device).toBe("phone");
      expect(attrs.displayMode).toBe("browser");
    });
  });
});
