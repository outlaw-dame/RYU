/**
 * Focus Management Utilities
 *
 * Provides focus trap for modals/sheets, skip-to-content navigation,
 * and focus restoration when dialogs close.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]'
].join(", ");

/**
 * Get all focusable elements within a container.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("aria-hidden") && el.offsetParent !== null
  );
}

/**
 * Focus Trap
 *
 * Constrains keyboard focus within a container element (for modals, sheets, dialogs).
 * Returns a cleanup function to deactivate the trap.
 */
export interface FocusTrapOptions {
  /** Element to focus when the trap activates. Defaults to first focusable element. */
  initialFocus?: HTMLElement | null;
  /** Whether to restore focus to the previously focused element on deactivation. */
  restoreFocus?: boolean;
}

export interface FocusTrapHandle {
  /** Deactivate the focus trap and optionally restore focus. */
  deactivate: () => void;
}

export function createFocusTrap(
  container: HTMLElement,
  options: FocusTrapOptions = {}
): FocusTrapHandle {
  const { initialFocus, restoreFocus = true } = options;
  const previouslyFocused = document.activeElement as HTMLElement | null;

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Tab") return;

    const focusable = getFocusableElements(container);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  container.addEventListener("keydown", handleKeyDown);

  // Set initial focus
  const targetFocus = initialFocus || getFocusableElements(container)[0];
  if (targetFocus) {
    // Delay to allow the DOM to settle (animations, rendering)
    requestAnimationFrame(() => {
      targetFocus.focus();
    });
  }

  return {
    deactivate() {
      container.removeEventListener("keydown", handleKeyDown);
      if (restoreFocus && previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    }
  };
}

/**
 * Skip to Content Link
 *
 * Creates or retrieves a skip-to-content link for keyboard navigation.
 * The link is visually hidden but appears on focus.
 */
export function ensureSkipToContent(
  mainContentId: string = "main-content",
  label: string = "Skip to content"
): HTMLAnchorElement {
  const existingLink = document.getElementById("ryu-skip-to-content") as HTMLAnchorElement | null;
  if (existingLink) {
    existingLink.textContent = label;
    existingLink.href = `#${mainContentId}`;
    return existingLink;
  }

  const link = document.createElement("a");
  link.id = "ryu-skip-to-content";
  link.href = `#${mainContentId}`;
  link.textContent = label;
  link.className = "ryu-skip-link";
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const target = document.getElementById(mainContentId);
    if (target) {
      target.setAttribute("tabindex", "-1");
      target.focus();
      // Remove tabindex after blur to avoid non-interactive tabstop
      target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
    }
  });

  // Insert as first child of body
  if (document.body.firstChild) {
    document.body.insertBefore(link, document.body.firstChild);
  } else {
    document.body.appendChild(link);
  }

  return link;
}

/**
 * Restore focus to a specific element. Useful when closing modals/sheets.
 */
export function restoreFocus(element: HTMLElement | null): void {
  if (element && typeof element.focus === "function") {
    // Delay to allow animations to complete
    requestAnimationFrame(() => {
      element.focus();
    });
  }
}
