/**
 * Live Region Announcer
 *
 * Provides a utility to announce messages to screen readers via aria-live regions.
 * Supports both "polite" (queued after current speech) and "assertive" (interrupts).
 */

export type LiveRegionPoliteness = "polite" | "assertive";

interface LiveRegionOptions {
  /** Delay in ms before clearing the announcement (default: 1000) */
  clearDelay?: number;
}

let politeRegion: HTMLElement | null = null;
let assertiveRegion: HTMLElement | null = null;
let activeTimer: ReturnType<typeof setTimeout> | null = null;

const REGION_STYLES = [
  "position: absolute",
  "width: 1px",
  "height: 1px",
  "padding: 0",
  "margin: -1px",
  "overflow: hidden",
  "clip: rect(0, 0, 0, 0)",
  "white-space: nowrap",
  "border: 0"
].join(";");

function createRegionElement(politeness: LiveRegionPoliteness): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("aria-live", politeness);
  el.setAttribute("aria-atomic", "true");
  el.setAttribute("role", "status");
  el.setAttribute("style", REGION_STYLES);
  el.id = `ryu-live-region-${politeness}`;
  return el;
}

function getOrCreateRegion(politeness: LiveRegionPoliteness): HTMLElement {
  if (politeness === "assertive") {
    if (!assertiveRegion || !document.body.contains(assertiveRegion)) {
      assertiveRegion = createRegionElement("assertive");
      assertiveRegion.setAttribute("role", "alert");
      document.body.appendChild(assertiveRegion);
    }
    return assertiveRegion;
  }

  if (!politeRegion || !document.body.contains(politeRegion)) {
    politeRegion = createRegionElement("polite");
    document.body.appendChild(politeRegion);
  }
  return politeRegion;
}

/**
 * Announce a message to screen readers.
 *
 * @param message - The text to announce
 * @param politeness - "polite" (default) queues after current speech; "assertive" interrupts
 * @param options - Additional configuration
 */
export function announce(
  message: string,
  politeness: LiveRegionPoliteness = "polite",
  options: LiveRegionOptions = {}
): void {
  if (typeof document === "undefined") return;

  const { clearDelay = 1000 } = options;
  const region = getOrCreateRegion(politeness);

  // Clear and re-set to trigger screen reader re-announcement
  region.textContent = "";

  // Clear previous timer to avoid race conditions with rapid calls
  if (activeTimer) clearTimeout(activeTimer);

  // Use a microtask to ensure the DOM update is processed as two separate changes
  requestAnimationFrame(() => {
    region.textContent = message;

    if (clearDelay > 0) {
      activeTimer = setTimeout(() => {
        region.textContent = "";
        activeTimer = null;
      }, clearDelay);
    }
  });
}

/**
 * Remove all live region elements from the DOM.
 * Useful for cleanup in tests or when unmounting the app.
 */
export function clearLiveRegions(): void {
  if (politeRegion && document.body.contains(politeRegion)) {
    document.body.removeChild(politeRegion);
  }
  if (assertiveRegion && document.body.contains(assertiveRegion)) {
    document.body.removeChild(assertiveRegion);
  }
  politeRegion = null;
  assertiveRegion = null;
}
