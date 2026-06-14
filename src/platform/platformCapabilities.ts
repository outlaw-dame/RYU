/**
 * Platform capability utilities
 * Provides convenient access to platform capabilities
 */

import { usePlatform } from "./PlatformProvider";

/**
 * Check if running on iOS (including iPadOS)
 */
export function useIsIOS(): boolean {
  const { os } = usePlatform();
  return os === "ios" || os === "ipados";
}

/**
 * Check if running on Android
 */
export function useIsAndroid(): boolean {
  const { os } = usePlatform();
  return os === "android";
}

/**
 * Check if running on desktop
 */
export function useIsDesktop(): boolean {
  const { deviceClass } = usePlatform();
  return deviceClass === "desktop";
}

/**
 * Check if running on mobile (phone or tablet)
 */
export function useIsMobile(): boolean {
  const { deviceClass } = usePlatform();
  return deviceClass === "phone" || deviceClass === "tablet";
}

/**
 * Check if running as standalone PWA
 */
export function useIsStandalone(): boolean {
  const { displayMode } = usePlatform();
  return displayMode === "standalone";
}

/**
 * Check if touch input is available
 */
export function useHasTouch(): boolean {
  const { input } = usePlatform();
  return input.coarsePointer;
}

/**
 * Check if hover input is available
 */
export function useHasHover(): boolean {
  const { input } = usePlatform();
  return input.hover;
}

/**
 * Check if safe area insets are supported
 */
export function useHasSafeAreaInsets(): boolean {
  const { capabilities } = usePlatform();
  return capabilities.safeAreaInsets;
}

/**
 * Check if web share API is available
 */
export function useCanWebShare(): boolean {
  const { capabilities } = usePlatform();
  return capabilities.webShare;
}

/**
 * Check if app badging is supported
 */
export function useCanBadge(): boolean {
  const { capabilities } = usePlatform();
  return capabilities.badging;
}

/**
 * Check if file system access is available
 */
export function useHasFileSystemAccess(): boolean {
  const { capabilities } = usePlatform();
  return capabilities.fileSystemAccess;
}

/**
 * Check if virtual keyboard is likely (mobile device with touch)
 */
export function useVirtualKeyboardLikely(): boolean {
  const { input } = usePlatform();
  return input.virtualKeyboardLikely;
}
