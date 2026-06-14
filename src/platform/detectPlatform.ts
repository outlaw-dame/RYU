/**
 * Platform detection utilities
 * Detects OS, device class, display mode, and capabilities
 */

import type {
  RyuOS,
  RyuTheme,
  RyuDeviceClass,
  RyuDisplayMode,
  RyuInputCapabilities,
  RyuPlatformCapabilities,
  RyuPlatform,
  PlatformDataAttributes
} from "./platformTypes";

/**
 * Detect the operating system
 */
export function detectOS(): RyuOS {
  const userAgent = navigator.userAgent;

  if (/iPad|iPhone|iPod/.test(userAgent)) {
    return "ios";
  }

  // iPad on iOS 13+ reports as Mac with touch support
  if (/Mac/.test(userAgent) && navigator.maxTouchPoints > 1) {
    return "ipados";
  }

  if (/Android/.test(userAgent)) {
    return "android";
  }

  if (/Mac/.test(userAgent)) {
    return "macos";
  }

  if (/Windows/.test(userAgent)) {
    return "windows";
  }

  if (/Linux/.test(userAgent)) {
    return "linux";
  }

  return "unknown";
}

/**
 * Detect the device class based on screen size and capabilities
 */
export function detectDeviceClass(): RyuDeviceClass {
  const width = window.innerWidth;

  if (width >= 1024) {
    return "desktop";
  }

  if (width >= 768) {
    return "tablet";
  }

  return "phone";
}

/**
 * Detect the display mode (PWA installation state)
 */
export function detectDisplayMode(): RyuDisplayMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "browser";
  }

  if (window.matchMedia("(display-mode: standalone)").matches) {
    return "standalone";
  }

  if (window.matchMedia("(display-mode: fullscreen)").matches) {
    return "fullscreen";
  }

  if (window.matchMedia("(display-mode: minimal-ui)").matches) {
    return "minimal-ui";
  }

  return "browser";
}

/**
 * Detect input capabilities
 */
export function detectInputCapabilities(): RyuInputCapabilities {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return { coarsePointer: false, hover: true, virtualKeyboardLikely: false };
  }

  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const hover = window.matchMedia("(hover: hover)").matches;

  return {
    coarsePointer,
    hover,
    virtualKeyboardLikely: coarsePointer && !hover
  };
}

/**
 * Detect platform capabilities
 */
export function detectPlatformCapabilities(): RyuPlatformCapabilities {
  const hasNavigator = typeof navigator !== "undefined";
  const hasWindow = typeof window !== "undefined";

  return {
    safeAreaInsets: typeof CSS !== "undefined" && typeof CSS.supports === "function"
      ? CSS.supports("padding-top: env(safe-area-inset-top)")
      : false,
    webShare: hasNavigator && "share" in navigator,
    badging: hasNavigator && "setAppBadge" in navigator,
    fileSystemAccess: hasWindow && "showOpenFilePicker" in window
  };
}

/**
 * Map OS to Framework7 theme
 */
export function mapOSToTheme(os: RyuOS): RyuTheme {
  switch (os) {
    case "ios":
    case "ipados":
    case "macos":
      return "ios";
    default:
      return "md";
  }
}

/**
 * Detect the complete platform information
 */
export function detectPlatform(): RyuPlatform {
  const os = detectOS();
  const deviceClass = detectDeviceClass();
  const displayMode = detectDisplayMode();
  const input = detectInputCapabilities();
  const capabilities = detectPlatformCapabilities();
  const theme = mapOSToTheme(os);

  return {
    os,
    theme,
    deviceClass,
    displayMode,
    input,
    capabilities
  };
}

/**
 * Get data attributes for setting on root element
 */
export function getPlatformDataAttributes(): PlatformDataAttributes {
  const os = detectOS();
  const deviceClass = detectDeviceClass();
  const displayMode = detectDisplayMode();

  return {
    os,
    device: deviceClass,
    displayMode
  };
}
