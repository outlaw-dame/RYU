import type {
  RyuOperatingSystem,
  RyuDeviceClass,
  RyuDisplayMode,
  RyuFrameworkTheme,
  RyuPlatformInput,
  RyuPlatformCapabilities,
  RyuPlatform
} from "./platformTypes";

/**
 * Detect the operating system
 */
export function detectOS(): RyuOperatingSystem {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  // 1. Android / iOS / iPadOS UA checks first
  if (/Android/.test(ua)) {
    return "android";
  }
  if (/iPad/.test(ua)) {
    return "ipados";
  }
  if (/iPhone|iPod/.test(ua)) {
    return "ios";
  }

  // 2. iPadOS fallback (MacIntel + maxTouchPoints > 1) before general macOS check
  if (platform === "MacIntel" && maxTouchPoints > 1) {
    return "ipados";
  }

  // 3. Desktop UA/Platform checks
  if (/Win/.test(ua) || platform.startsWith("Win")) {
    return "windows";
  }
  if (/Linux/.test(ua) || platform.startsWith("Linux")) {
    return "linux";
  }
  if (/Mac/.test(ua) || platform.startsWith("Mac")) {
    return "macos";
  }
  return "unknown";
}

/**
 * Detect the device class based on screen size and capabilities
 */
export function detectDeviceClass(): RyuDeviceClass {
  if (typeof window === "undefined") {
    const os = detectOS();
    if (os === "ios" || os === "android") return "phone";
    if (os === "ipados") return "tablet";
    return "desktop";
  }
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
  if (typeof window === "undefined") return "browser";
  if (typeof window.matchMedia === "function") {
    if (window.matchMedia("(display-mode: standalone)").matches) return "standalone";
    if (window.matchMedia("(display-mode: fullscreen)").matches) return "fullscreen";
    if (window.matchMedia("(display-mode: minimal-ui)").matches) return "minimal-ui";
  }
  if (typeof navigator !== "undefined" && (navigator as any).standalone === true) {
    return "standalone";
  }
  return "browser";
}

/**
 * Detect input capabilities
 */
export function detectInput(deviceClass: RyuDeviceClass): RyuPlatformInput {
  const coarsePointer = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(pointer: coarse)").matches
    : false;
  const hover = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(hover: hover)").matches
    : true;

  return {
    coarsePointer,
    hover,
    virtualKeyboardLikely: (deviceClass === "phone" || deviceClass === "tablet") && coarsePointer
  };
}

/**
 * Detect platform capabilities
 */
export function detectCapabilities(): RyuPlatformCapabilities {
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
export function mapOSToTheme(os: RyuOperatingSystem): RyuFrameworkTheme {
  if (os === "android") return "md";
  return "ios"; // default to ios for desktop/unknown as RYU fallback
}

/**
 * Detect the complete platform information
 */
export function detectPlatform(): RyuPlatform {
  const os = detectOS();
  const deviceClass = detectDeviceClass();
  const displayMode = detectDisplayMode();
  const input = detectInput(deviceClass);
  const capabilities = detectCapabilities();
  const frameworkTheme = mapOSToTheme(os);

  return {
    os,
    deviceClass,
    frameworkTheme,
    displayMode,
    input,
    capabilities
  };
}
