import { useEffect, useRef, useState } from "react";
import type { MastodonStatus } from "../../sync/mastodon-client";
import { postMastodonStatus } from "../../sync/mastodon-activity-api";

const MAX_LENGTH = 500;
const WARN_AT = 450;

const BOOK_HASHTAGS = [
  "#bookstodon", "#nowreading", "#currentlyreading",
  "#bookclub", "#amreading", "#bookreview"
] as const;

type Visibility = "public" | "unlisted" | "private";

const VISIBILITY_OPTIONS: { value: Visibility; label: string; desc: string }[] = [
  { value: "public",   label: "Public",    desc: "Anyone can see" },
  { value: "unlisted", label: "Unlisted",  desc: "Not in public timelines" },
  { value: "private",  label: "Followers", desc: "Followers only" }
];

export function ComposeSheet({
  onClose,
  onPost,
  defaultText
}: {
  onClose: () => void;
  onPost: (status: MastodonStatus) => void;
  defaultText?: string;
}) {
  const [text, setText] = useState(defaultText ?? "");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !posting) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, posting]);

  const remaining = MAX_LENGTH - text.length;
  const canPost = text.trim().length > 0 && remaining >= 0 && !posting;

  function toggleHashtag(tag: string) {
    setText((prev) => {
      const lower = prev.toLowerCase();
      if (lower.includes(tag.toLowerCase())) {
        return prev.replace(new RegExp(`\\s*${tag.replace("#", "\\#")}\\b`, "gi"), "").trimEnd();
      }
      const trimmed = prev.trimEnd();
      return trimmed ? `${trimmed} ${tag}` : tag;
    });
    setError(null);
  }

  async function handlePost() {
    const trimmed = text.trim();
    if (!trimmed || posting) return;

    setPosting(true);
    setError(null);

    try {
      const status = await postMastodonStatus({ status: trimmed, visibility });
      onPost(status);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Failed to post. Try again.";
      setError(raw.slice(0, 240));
    } finally {
      setPosting(false);
    }
  }

  const counterColor = remaining < 0
    ? "var(--color-danger)"
    : remaining < MAX_LENGTH - WARN_AT
      ? "var(--color-rating)"
      : "var(--color-text-tertiary)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Compose reading update"
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in srgb, var(--color-bg) 64%, black 36%)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        zIndex: 60
      }}
      onClick={() => { if (!posting) onClose(); }}
    >
      <section
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-bg-elevated)",
          borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
          padding: "var(--space-5) var(--space-4)",
          paddingBottom: "calc(var(--space-6) + env(safe-area-inset-bottom, 0px))",
          display: "grid",
          gap: "var(--space-4)",
          maxHeight: "88dvh",
          overflowY: "auto",
          boxShadow: "0 -2px 24px rgba(0,0,0,0.12)"
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--text-headline)", fontWeight: 700, color: "var(--color-text)" }}>
            Reading Update
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={posting}
            style={{
              border: 0,
              borderRadius: "var(--radius-sm)",
              background: "var(--color-bg-secondary)",
              color: "var(--color-text-secondary)",
              fontWeight: 600,
              fontSize: "var(--text-footnote)",
              minHeight: "var(--touch-min)",
              padding: "0 var(--space-3)",
              cursor: "pointer",
              opacity: posting ? 0.5 : 1
            }}
          >
            Cancel
          </button>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => { setText(e.target.value); setError(null); }}
          placeholder="What are you reading? Share a book update with your community..."
          maxLength={520}
          rows={4}
          disabled={posting}
          style={{
            width: "100%",
            boxSizing: "border-box",
            resize: "none",
            border: "1px solid color-mix(in srgb, var(--color-text) 14%, transparent)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-bg)",
            color: "var(--color-text)",
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-body)",
            lineHeight: "var(--leading-body)",
            padding: "var(--space-3) var(--space-4)",
            outline: "none",
            opacity: posting ? 0.7 : 1
          }}
        />

        {/* Character counter */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "calc(-1 * var(--space-3))" }}>
          <span style={{ fontSize: "var(--text-caption1)", color: counterColor, fontVariantNumeric: "tabular-nums" }}>
            {remaining}
          </span>
        </div>

        {/* Hashtag chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          {BOOK_HASHTAGS.map((tag) => {
            const active = text.toLowerCase().includes(tag.toLowerCase());
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleHashtag(tag)}
                disabled={posting}
                aria-pressed={active}
                style={{
                  border: active
                    ? "1px solid color-mix(in srgb, var(--color-accent) 70%, transparent)"
                    : "1px solid color-mix(in srgb, var(--color-text) 14%, transparent)",
                  borderRadius: "var(--radius-full)",
                  background: active
                    ? "color-mix(in srgb, var(--color-accent) 16%, var(--color-bg))"
                    : "var(--color-bg-secondary)",
                  color: "var(--color-text)",
                  fontSize: "var(--text-caption1)",
                  fontWeight: 600,
                  padding: "4px var(--space-3)",
                  cursor: "pointer",
                  opacity: posting ? 0.6 : 1
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>

        {/* Visibility selector */}
        <div>
          <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-caption1)", color: "var(--color-text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "var(--tracking-caps)" }}>
            Visibility
          </p>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            {VISIBILITY_OPTIONS.map(({ value, label }) => {
              const active = visibility === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setVisibility(value)}
                  disabled={posting}
                  aria-pressed={active}
                  style={{
                    flex: 1,
                    minHeight: "calc(var(--touch-min) - 8px)",
                    border: active
                      ? "1px solid color-mix(in srgb, var(--color-accent) 60%, transparent)"
                      : "1px solid color-mix(in srgb, var(--color-text) 14%, transparent)",
                    borderRadius: "var(--radius-md)",
                    background: active
                      ? "color-mix(in srgb, var(--color-accent) 14%, var(--color-bg))"
                      : "var(--color-bg-secondary)",
                    color: "var(--color-text)",
                    fontSize: "var(--text-footnote)",
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                    opacity: posting ? 0.6 : 1
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {error ? (
          <p style={{ margin: 0, color: "var(--color-danger)", fontSize: "var(--text-footnote)", lineHeight: "var(--leading-footnote)" }}>
            {error}
          </p>
        ) : null}

        {/* Post button */}
        <button
          type="button"
          onClick={() => { void handlePost(); }}
          disabled={!canPost}
          style={{
            minHeight: "var(--touch-min)",
            border: 0,
            borderRadius: "var(--radius-md)",
            background: canPost ? "var(--color-accent)" : "color-mix(in srgb, var(--color-accent) 40%, var(--color-bg))",
            color: "white",
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-subhead)",
            fontWeight: 700,
            cursor: canPost ? "pointer" : "default",
            transition: "background 0.15s"
          }}
        >
          {posting ? "Posting…" : "Post Update"}
        </button>
      </section>
    </div>
  );
}
