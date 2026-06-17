import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { ComposeSheet } from "./ComposeSheet";

// Mock Framework7 components used by AdaptiveSheet and AdaptiveButton
vi.mock("framework7-react", () => ({
  Sheet: ({ children, opened, onSheetClose, closeByBackdropClick, closeOnEscape, swipeToClose }: any) => {
    if (!opened) return null;
    return (
      <div data-testid="f7-sheet" data-close-backdrop={String(closeByBackdropClick)} data-close-escape={String(closeOnEscape)} data-swipe={String(swipeToClose)}>
        {children}
      </div>
    );
  },
  PageContent: ({ children }: any) => <div data-testid="f7-page-content">{children}</div>,
  Button: ({ children, disabled, onClick, fill, className, "aria-label": ariaLabel, type }: any) => (
    <button disabled={disabled} onClick={onClick} data-fill={String(fill)} aria-label={ariaLabel} className={className} type={type}>{children}</button>
  )
}));

// Mock postMastodonStatus
vi.mock("../../sync/mastodon-activity-api", () => ({
  postMastodonStatus: vi.fn()
}));

import { postMastodonStatus } from "../../sync/mastodon-activity-api";
const mockPostStatus = vi.mocked(postMastodonStatus);

describe("ComposeSheet", () => {
  const defaultProps = {
    onClose: vi.fn(),
    onPost: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderSheet(props?: Partial<typeof defaultProps & { defaultText?: string }>) {
    return render(<ComposeSheet {...defaultProps} {...props} />);
  }

  function getTextarea(container: HTMLElement): HTMLTextAreaElement {
    const el = container.querySelector("textarea") as HTMLTextAreaElement;
    if (!el) throw new Error("Compose textarea not found");
    return el;
  }

  function getPostButton(container: HTMLElement): HTMLButtonElement {
    const btn = container.querySelector("[aria-label*='ost update']") as HTMLButtonElement;
    if (!btn) throw new Error("Post button not found");
    return btn;
  }

  function getCancelButton(container: HTMLElement): HTMLButtonElement {
    const btn = container.querySelector("[aria-label='Cancel compose']") as HTMLButtonElement;
    if (!btn) throw new Error("Cancel button not found");
    return btn;
  }

  it("renders the compose sheet with heading and textarea", () => {
    const { container } = renderSheet();
    expect(container.querySelector("h2")?.textContent).toBe("Reading Update");
    expect(getTextarea(container)).toBeTruthy();
  });

  it("typing enables the Post button", () => {
    const { container } = renderSheet();
    const textarea = getTextarea(container);
    const postBtn = getPostButton(container);

    // Initially disabled (empty)
    expect(postBtn.disabled).toBe(true);

    fireEvent.change(textarea, { target: { value: "Reading a great book!" } });
    expect(postBtn.disabled).toBe(false);
  });

  it("empty or whitespace-only text disables Post", () => {
    const { container } = renderSheet();
    const textarea = getTextarea(container);
    const postBtn = getPostButton(container);

    fireEvent.change(textarea, { target: { value: "   " } });
    expect(postBtn.disabled).toBe(true);

    fireEvent.change(textarea, { target: { value: "" } });
    expect(postBtn.disabled).toBe(true);
  });

  it("over-limit text disables Post", () => {
    const { container } = renderSheet();
    const textarea = getTextarea(container);
    const postBtn = getPostButton(container);

    // 501 characters exceeds MAX_LENGTH of 500
    const longText = "a".repeat(501);
    fireEvent.change(textarea, { target: { value: longText } });
    expect(postBtn.disabled).toBe(true);
  });

  it("visibility selector toggles between options", () => {
    const { container } = renderSheet();
    const radioGroup = container.querySelector("[role='radiogroup']") as HTMLElement;
    const radios = radioGroup.querySelectorAll("[role='radio']");

    const publicBtn = radios[0] as HTMLButtonElement;
    const followersBtn = radios[2] as HTMLButtonElement; // third = Followers

    // Public is active by default
    expect(publicBtn.getAttribute("aria-checked")).toBe("true");
    expect(followersBtn.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(followersBtn);
    expect(followersBtn.getAttribute("aria-checked")).toBe("true");
    expect(publicBtn.getAttribute("aria-checked")).toBe("false");
  });

  it("hashtag toggle adds and removes tags from text", () => {
    const { container } = renderSheet();
    const textarea = getTextarea(container);

    // Click #bookstodon chip
    const hashtagGroup = container.querySelector("[role='group']") as HTMLElement;
    const bookstodonChip = hashtagGroup.querySelector("button") as HTMLButtonElement; // first = #bookstodon
    fireEvent.click(bookstodonChip);
    expect(textarea.value).toContain("#bookstodon");

    // Click again to remove it
    fireEvent.click(bookstodonChip);
    expect(textarea.value).not.toContain("#bookstodon");
  });

  it("successful post calls onPost with the returned status", async () => {
    const mockStatus = { id: "123", content: "test", visibility: "public" } as unknown as import("../../sync/mastodon-client").MastodonStatus;
    mockPostStatus.mockResolvedValueOnce(mockStatus);

    const { container } = renderSheet();
    const textarea = getTextarea(container);
    fireEvent.change(textarea, { target: { value: "My reading update" } });

    const postBtn = getPostButton(container);
    fireEvent.click(postBtn);

    await waitFor(() => {
      expect(defaultProps.onPost).toHaveBeenCalledWith(mockStatus);
    });
  });

  it("post error is displayed safely (truncated to 240 chars)", async () => {
    const longError = "x".repeat(300);
    mockPostStatus.mockRejectedValueOnce(new Error(longError));

    const { container } = renderSheet();
    const textarea = getTextarea(container);
    fireEvent.change(textarea, { target: { value: "A post that will fail" } });

    const postBtn = getPostButton(container);
    fireEvent.click(postBtn);

    await waitFor(() => {
      const alert = container.querySelector("[role='alert']") as HTMLElement;
      expect(alert).toBeTruthy();
      expect(alert.textContent!.length).toBeLessThanOrEqual(240);
    });
  });

  it("backdrop close is disabled while posting", async () => {
    mockPostStatus.mockImplementation(() => new Promise(() => {}));

    const { container } = renderSheet();
    const textarea = getTextarea(container);
    fireEvent.change(textarea, { target: { value: "Posting..." } });

    const postBtn = getPostButton(container);
    fireEvent.click(postBtn);

    await waitFor(() => {
      const sheet = container.querySelector("[data-testid='f7-sheet']") as HTMLElement;
      expect(sheet.getAttribute("data-close-backdrop")).toBe("false");
      expect(sheet.getAttribute("data-close-escape")).toBe("false");
      expect(sheet.getAttribute("data-swipe")).toBe("false");
    });
  });

  it("textarea has native keyboard attributes", () => {
    const { container } = renderSheet();
    const textarea = getTextarea(container);

    expect(textarea.getAttribute("autocapitalize")).toBe("sentences");
    expect(textarea.getAttribute("autocorrect")).toBe("on");
    expect(textarea.getAttribute("spellcheck")).toBe("true");
    expect(textarea.getAttribute("enterkeyhint")).toBe("done");
  });

  it("renders with defaultText pre-filled", () => {
    const { container } = renderSheet({ defaultText: "Already here" });
    const textarea = getTextarea(container);
    expect(textarea.value).toBe("Already here");
  });

  it("character counter shows remaining characters", () => {
    const { container } = renderSheet();
    // With empty text, should show 500
    const counter = container.querySelector("[aria-live='polite']") as HTMLElement;
    expect(counter.textContent).toBe("500");
  });

  it("Cancel button calls onClose", () => {
    const { container } = renderSheet();
    const cancelBtn = getCancelButton(container);
    fireEvent.click(cancelBtn);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });
});
