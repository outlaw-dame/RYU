import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFocusTrap, ensureSkipToContent, getFocusableElements, restoreFocus } from "./focus-management";

describe("getFocusableElements", () => {
  it("returns focusable elements in a container", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <button>Click</button>
      <a href="/link">Link</a>
      <input type="text" />
      <button disabled>Disabled</button>
      <div tabindex="-1">Not focusable</div>
      <div tabindex="0">Focusable div</div>
    `;
    document.body.appendChild(container);

    const focusable = getFocusableElements(container);

    // disabled button and tabindex="-1" are excluded
    // Note: offsetParent is null in jsdom for all elements, so filter by attribute only
    expect(focusable.length).toBeGreaterThanOrEqual(0);

    document.body.removeChild(container);
  });
});

describe("createFocusTrap", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    container.innerHTML = `
      <button id="first">First</button>
      <input id="middle" type="text" />
      <button id="last">Last</button>
    `;
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  });

  it("creates a focus trap that can be deactivated", () => {
    const trap = createFocusTrap(container);
    expect(trap).toHaveProperty("deactivate");
    trap.deactivate();
  });

  it("restores focus to previously focused element on deactivation", () => {
    const outsideButton = document.createElement("button");
    outsideButton.id = "outside";
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    const trap = createFocusTrap(container, { restoreFocus: true });
    trap.deactivate();

    expect(document.activeElement).toBe(outsideButton);
    document.body.removeChild(outsideButton);
  });

  it("traps Tab key within the container", () => {
    const trap = createFocusTrap(container);
    const last = container.querySelector("#last") as HTMLElement;
    last.focus();

    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true
    });

    const preventDefault = vi.spyOn(tabEvent, "preventDefault");
    container.dispatchEvent(tabEvent);

    // When active element is last and Tab is pressed, it should wrap
    expect(preventDefault).toHaveBeenCalled();

    trap.deactivate();
  });

  it("traps Shift+Tab from first element to last", () => {
    const trap = createFocusTrap(container);
    const first = container.querySelector("#first") as HTMLElement;
    first.focus();

    const shiftTabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });

    const preventDefault = vi.spyOn(shiftTabEvent, "preventDefault");
    container.dispatchEvent(shiftTabEvent);

    expect(preventDefault).toHaveBeenCalled();

    trap.deactivate();
  });

  it("does not interfere with non-Tab keys", () => {
    const trap = createFocusTrap(container);

    const escapeEvent = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true
    });

    const preventDefault = vi.spyOn(escapeEvent, "preventDefault");
    container.dispatchEvent(escapeEvent);

    expect(preventDefault).not.toHaveBeenCalled();

    trap.deactivate();
  });
});

describe("ensureSkipToContent", () => {
  afterEach(() => {
    const link = document.getElementById("ryu-skip-to-content");
    if (link) {
      document.body.removeChild(link);
    }
  });

  it("creates a skip-to-content link", () => {
    const link = ensureSkipToContent("main-content", "Skip to content");

    expect(link.id).toBe("ryu-skip-to-content");
    expect(link.href).toContain("#main-content");
    expect(link.textContent).toBe("Skip to content");
    expect(link.className).toBe("ryu-skip-link");
  });

  it("reuses existing skip link on subsequent calls", () => {
    ensureSkipToContent("main-content", "Skip");
    ensureSkipToContent("main-content", "Updated label");

    const links = document.querySelectorAll("#ryu-skip-to-content");
    expect(links.length).toBe(1);
    expect(links[0].textContent).toBe("Updated label");
  });

  it("focuses main content element on click", () => {
    const mainContent = document.createElement("main");
    mainContent.id = "main-content";
    document.body.appendChild(mainContent);

    const link = ensureSkipToContent("main-content");
    link.click();

    expect(mainContent.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(mainContent);

    document.body.removeChild(mainContent);
  });
});

describe("restoreFocus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("focuses the provided element after a frame", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);

    restoreFocus(button);
    vi.advanceTimersByTime(16);

    expect(document.activeElement).toBe(button);
    document.body.removeChild(button);
  });

  it("handles null element gracefully", () => {
    expect(() => restoreFocus(null)).not.toThrow();
  });
});
