/**
 * Platform detection types for RYU
 * Provides a stable abstraction over device, OS, and display mode detection
 */

export type RyuOS = "ios" | "ipados" | "android" | "macos" | "windows" | "linux" | "unknown";
export type RyuTheme = "ios" | "md";
export type RyuDeviceClass = "phone" | "tablet" | "desktop";
export type RyuDisplayMode = "browser" | "standalone" | "fullscreen" | "minimal-ui";

export interface RyuInputCapabilities {
  coarsePointer: boolean;
  hover: boolean;
  virtualKeyboardLikely: boolean;
}

export interface RyuPlatformCapabilities {
  safeAreaInsets: boolean;
  webShare: boolean;
  badging: boolean;
  fileSystemAccess: boolean;
}

export interface RyuPlatform {
  os: RyuOS;
  theme: RyuTheme;
  deviceClass: RyuDeviceClass;
  displayMode: RyuDisplayMode;
  input: RyuInputCapabilities;
  capabilities: RyuPlatformCapabilities;
}

// Platform detection result that can be used for CSS data attributes
export interface PlatformDataAttributes {
  os: RyuOS;
  device: RyuDeviceClass;
  displayMode: RyuDisplayMode;
}
