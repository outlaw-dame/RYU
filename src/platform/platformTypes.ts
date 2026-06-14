export type RyuOperatingSystem =
  | "ios"
  | "ipados"
  | "android"
  | "macos"
  | "windows"
  | "linux"
  | "unknown";

export type RyuDeviceClass = "phone" | "tablet" | "desktop";

export type RyuDisplayMode = "browser" | "standalone" | "fullscreen" | "minimal-ui";

export type RyuFrameworkTheme = "ios" | "md";

export interface RyuPlatformInput {
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
  os: RyuOperatingSystem;
  deviceClass: RyuDeviceClass;
  frameworkTheme: RyuFrameworkTheme;
  displayMode: RyuDisplayMode;
  input: RyuPlatformInput;
  capabilities: RyuPlatformCapabilities;
}
