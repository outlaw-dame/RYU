/**
 * Reduced Motion Detection
 *
 * Provides utilities and a React hook for detecting and respecting
 * the user's prefers-reduced-motion system preference.
 */

import { useState, useEffect } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Check if the user prefers reduced motion (non-reactive, one-time check).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(QUERY).matches;
}

/**
 * React hook that reactively tracks the prefers-reduced-motion media query.
 * Re-renders when the user changes their system preference.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => prefersReducedMotion());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mq = window.matchMedia(QUERY);
    const handler = (event: MediaQueryListEvent) => {
      setReduced(event.matches);
    };

    // Set initial state in case it changed between render and effect
    setReduced(mq.matches);

    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }

    // Fallback for older browsers
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  return reduced;
}

/**
 * Returns motion-safe animation duration. When reduced motion is preferred,
 * returns 0 (instant). Otherwise returns the provided duration.
 */
export function motionSafeDuration(durationMs: number): number {
  return prefersReducedMotion() ? 0 : durationMs;
}
