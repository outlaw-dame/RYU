import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { prefersReducedMotion, useReducedMotion, motionSafeDuration } from "./reduced-motion";

describe("prefersReducedMotion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when no reduced motion preference is set", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    expect(prefersReducedMotion()).toBe(false);
  });

  it("returns true when reduced motion is preferred", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    expect(prefersReducedMotion()).toBe(true);
  });

  it("returns false when window is undefined", () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error -- testing non-browser environment
    delete globalThis.window;
    // Import check won't apply since function checks typeof window at call time
    // Re-stub after the delete
    Object.defineProperty(globalThis, "window", { value: undefined, configurable: true });
    expect(prefersReducedMotion()).toBe(false);
    Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
  });
});

describe("useReducedMotion", () => {
  let listeners: Array<(event: MediaQueryListEvent) => void>;
  let mockMatchMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listeners = [];
    mockMatchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: (_event: string, handler: (event: MediaQueryListEvent) => void) => {
        listeners.push(handler);
      },
      removeEventListener: (_event: string, handler: (event: MediaQueryListEvent) => void) => {
        listeners = listeners.filter((l) => l !== handler);
      }
    });
    vi.stubGlobal("matchMedia", mockMatchMedia);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when reduced motion is not preferred", () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it("returns true when reduced motion is preferred", () => {
    mockMatchMedia.mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it("updates when the preference changes", () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      listeners.forEach((l) => l({ matches: true } as MediaQueryListEvent));
    });

    expect(result.current).toBe(true);
  });

  it("cleans up listeners on unmount", () => {
    const removeEventListener = vi.fn();
    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: (_event: string, handler: (event: MediaQueryListEvent) => void) => {
        listeners.push(handler);
      },
      removeEventListener
    });

    const { unmount } = renderHook(() => useReducedMotion());
    unmount();

    expect(removeEventListener).toHaveBeenCalled();
  });
});

describe("motionSafeDuration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the provided duration when motion is not reduced", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    expect(motionSafeDuration(300)).toBe(300);
  });

  it("returns 0 when reduced motion is preferred", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    expect(motionSafeDuration(300)).toBe(0);
  });
});
