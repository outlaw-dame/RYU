import React, { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { RyuPlatform } from "./platformTypes";
import { detectPlatform } from "./detectPlatform";

export const PlatformContext = createContext<RyuPlatform | null>(null);

interface PlatformProviderProps {
  children: ReactNode;
}

export function PlatformProvider({ children }: PlatformProviderProps): React.ReactElement {
  const [platform, setPlatform] = useState<RyuPlatform>(() => detectPlatform());

  useEffect(() => {
    let timeoutId: number | undefined;

    const updatePlatform = () => {
      setPlatform(detectPlatform());
    };

    const handleResize = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        updatePlatform();
      }, 150);
    };

    window.addEventListener("resize", handleResize);

    // Guard matchMedia check for environments where matchMedia is not a function
    const mqs = typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? [
          window.matchMedia("(display-mode: standalone)"),
          window.matchMedia("(display-mode: fullscreen)"),
          window.matchMedia("(display-mode: minimal-ui)"),
          window.matchMedia("(pointer: coarse)"),
          window.matchMedia("(hover: hover)")
        ]
      : [];

    mqs.forEach(mq => {
      if (typeof mq.addEventListener === "function") {
        mq.addEventListener("change", updatePlatform);
      } else if (typeof mq.addListener === "function") {
        mq.addListener(updatePlatform);
      }
    });

    return () => {
      window.removeEventListener("resize", handleResize);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      mqs.forEach(mq => {
        if (typeof mq.removeEventListener === "function") {
          mq.removeEventListener("change", updatePlatform);
        } else if (typeof mq.removeListener === "function") {
          mq.removeListener(updatePlatform);
        }
      });
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined" || !document.documentElement) return;
    const root = document.documentElement;

    root.setAttribute("data-ryu-os", platform.os);
    root.setAttribute("data-ryu-device", platform.deviceClass);
    root.setAttribute("data-ryu-display-mode", platform.displayMode);
    root.setAttribute("data-ryu-framework-theme", platform.frameworkTheme);
    root.setAttribute("data-ryu-pointer", platform.input.coarsePointer ? "coarse" : "fine");
    root.setAttribute("data-ryu-hover", platform.input.hover ? "hover" : "none");
  }, [platform]);

  return (
    <PlatformContext.Provider value={platform}>
      {children}
    </PlatformContext.Provider>
  );
}

/**
 * Hook to access platform information.
 * Resolves circular dependency by defining it here.
 */
export function usePlatform(): RyuPlatform {
  const context = useContext(PlatformContext);
  if (!context) {
    throw new Error("usePlatform must be used within a PlatformProvider");
  }
  return context;
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
