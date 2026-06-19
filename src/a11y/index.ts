/**
 * Accessibility Module
 *
 * Centralized accessibility utilities for RYU.
 */

export { announce, clearLiveRegions } from "./live-region";
export type { LiveRegionPoliteness } from "./live-region";

export {
  createFocusTrap,
  ensureSkipToContent,
  getFocusableElements,
  restoreFocus
} from "./focus-management";
export type { FocusTrapHandle, FocusTrapOptions } from "./focus-management";

export {
  prefersReducedMotion,
  useReducedMotion,
  motionSafeDuration
} from "./reduced-motion";
