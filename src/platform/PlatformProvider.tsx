/**
 * Platform Provider Component
 * Provides platform detection context to the entire app
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { RyuPlatform } from "./platformTypes";
import { detectPlatform } from "./detectPlatform";

interface PlatformContextType {
  platform: RyuPlatform;
}

const PlatformContext = createContext<PlatformContextType | null>(null);

interface PlatformProviderProps {
  children: ReactNode;
}

export function PlatformProvider({ children }: PlatformProviderProps): React.ReactElement {
  const [platform, setPlatform] = useState<RyuPlatform>(detectPlatform);

  // Update platform detection on resize and display mode changes
  useEffect(() => {
    const handleResize = () => {
      setPlatform(detectPlatform());
    };

    const handleDisplayModeChange = () => {
      setPlatform(detectPlatform());
    };

    window.addEventListener("resize", handleResize);

    // Listen for display mode changes (PWA installation/uninstallation)
    const displayModeMedia = window.matchMedia("(display-mode: standalone)");
    displayModeMedia.addEventListener("change", handleDisplayModeChange);

    return () => {
      window.removeEventListener("resize", handleResize);
      displayModeMedia.removeEventListener("change", handleDisplayModeChange);
    };
  }, []);

  // Set data attributes on root element — reuse existing platform state
  // to avoid redundant detection queries.
  useEffect(() => {
    const root = document.documentElement;

    root.dataset.os = platform.os;
    root.dataset.device = platform.deviceClass;
    root.dataset.displayMode = platform.displayMode;
  }, [platform]);

  const contextValue = useMemo(() => ({ platform }), [platform]);

  return (
    <PlatformContext.Provider value={contextValue}>
      {children}
    </PlatformContext.Provider>
  );
}

/**
 * Hook to access platform information
 */
export function usePlatform(): RyuPlatform {
  const context = useContext(PlatformContext);

  if (!context) {
    throw new Error("usePlatform must be used within a PlatformProvider");
  }

  return context.platform;
}

/**
 * Hook to access specific platform properties with type safety
 */
export function usePlatformValue<K extends keyof RyuPlatform>(
  key: K
): RyuPlatform[K] {
  const platform = usePlatform();
  return platform[key];
}
