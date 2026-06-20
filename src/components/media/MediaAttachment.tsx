/**
 * MediaAttachment - renders a single Mastodon media attachment.
 *
 * Supports:
 * - image: standard <img> with lazy loading
 * - gifv: autoplay muted loop <video> (animated GIF replacement)
 * - video: native <video> with controls
 * - audio: native <audio> with controls
 *
 * All media respects the sensitive/content-warning flag via an optional
 * blur overlay that the user can tap to reveal.
 */

import React, { useState } from "react";
import { useTranslation } from "react-i18next";

export type MediaAttachmentType = "image" | "gifv" | "video" | "audio" | "unknown";

export interface MediaAttachmentData {
  id: string;
  type: MediaAttachmentType;
  url: string;
  preview_url?: string;
  remote_url?: string;
  description?: string;
  blurhash?: string;
  meta?: {
    original?: { width?: number; height?: number; duration?: number };
    small?: { width?: number; height?: number };
  };
}

export interface MediaAttachmentProps {
  attachment: MediaAttachmentData;
  sensitive?: boolean;
  /** Compact mode for gallery grid items */
  compact?: boolean;
  /** Fill the parent container's height (useful for grid layouts) */
  filled?: boolean;
}

export function MediaAttachment({ attachment, sensitive = false, compact = false, filled = false }: MediaAttachmentProps) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(!sensitive);
  const [imageError, setImageError] = useState(false);

  const src = attachment.url || attachment.remote_url || "";
  const previewSrc = attachment.preview_url || "";
  const alt = attachment.description || "";
  const aspectRatio = getAspectRatio(attachment);

  if (!src && !previewSrc) return null;

  const containerStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: filled ? "100%" : undefined,
    aspectRatio: filled ? undefined : (compact ? "1" : aspectRatio),
    borderRadius: "var(--radius-md)",
    overflow: "hidden",
    background: "var(--color-bg)"
  };

  // Sensitive overlay
  if (!revealed) {
    return (
      <div style={containerStyle}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "color-mix(in srgb, var(--color-bg) 85%, transparent)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            cursor: "pointer",
            zIndex: 1
          }}
          onClick={() => setRevealed(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setRevealed(true); } }}
          role="button"
          tabIndex={0}
          aria-label={t("media.revealSensitive")}
        >
          <span style={{
            padding: "var(--space-2) var(--space-3)",
            borderRadius: "var(--radius-md)",
            background: "color-mix(in srgb, var(--color-text) 8%, transparent)",
            color: "var(--color-text-secondary)",
            fontSize: "var(--text-footnote)",
            fontWeight: 600
          }}>
            {t("media.sensitiveContent")}
          </span>
        </div>
        {/* Blurred preview behind overlay */}
        {previewSrc && attachment.type !== "audio" ? (
          <img
            src={previewSrc}
            alt=""
            aria-hidden="true"
            style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(20px)", transform: "scale(1.1)" }}
          />
        ) : null}
      </div>
    );
  }

  switch (attachment.type) {
    case "image":
      return (
        <div style={containerStyle}>
          {!imageError ? (
            <img
              src={src}
              alt={alt}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImageError(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
              {t("media.loadFailed")}
            </div>
          )}
        </div>
      );

    case "gifv":
      return (
        <div style={containerStyle}>
          <video
            src={src}
            poster={previewSrc || undefined}
            autoPlay
            loop
            muted
            playsInline
            aria-label={alt || t("media.animatedImage")}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      );

    case "video":
      return (
        <div style={containerStyle}>
          <video
            src={src}
            poster={previewSrc || undefined}
            controls
            playsInline
            preload="metadata"
            aria-label={alt || t("media.video")}
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", background: "#000" }}
          />
        </div>
      );

    case "audio":
      return (
        <div style={{
          width: "100%",
          padding: "var(--space-3)",
          borderRadius: "var(--radius-md)",
          background: "var(--color-bg-secondary)",
          display: "grid",
          gap: "var(--space-2)"
        }}>
          {alt ? (
            <span style={{ fontSize: "var(--text-caption1)", color: "var(--color-text-secondary)" }}>{alt}</span>
          ) : null}
          <audio
            src={src}
            controls
            preload="metadata"
            aria-label={alt || t("media.audio")}
            style={{ width: "100%", height: 40 }}
          />
        </div>
      );

    default:
      return null;
  }
}

function getAspectRatio(attachment: MediaAttachmentData): string {
  const meta = attachment.meta?.original ?? attachment.meta?.small;
  if (meta?.width && meta?.height && meta.width > 0 && meta.height > 0) {
    return `${meta.width} / ${meta.height}`;
  }
  // Default aspect ratios by type
  if (attachment.type === "video" || attachment.type === "gifv") return "16 / 9";
  return "4 / 3";
}
