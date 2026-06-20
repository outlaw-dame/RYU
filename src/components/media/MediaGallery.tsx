/**
 * MediaGallery - renders a grid of media attachments from a Mastodon status.
 *
 * Layout adapts based on attachment count:
 * - 1 item: full-width
 * - 2 items: side-by-side (2 columns)
 * - 3 items: 1 large + 2 small (2-row layout)
 * - 4+ items: 2x2 grid
 *
 * Sensitive content reveal is gallery-wide: clicking one item reveals all.
 */

import React, { useState } from "react";
import { MediaAttachment, type MediaAttachmentData } from "./MediaAttachment";

export interface MediaGalleryProps {
  attachments: MediaAttachmentData[];
  sensitive?: boolean;
}

export function MediaGallery({ attachments, sensitive = false }: MediaGalleryProps) {
  const [revealed, setRevealed] = useState(!sensitive);

  if (!attachments || attachments.length === 0) return null;

  // Filter out unknown/unsupported types
  const supported = attachments.filter(
    (a) => a.type === "image" || a.type === "gifv" || a.type === "video" || a.type === "audio"
  );

  if (supported.length === 0) return null;

  // Audio-only: stack vertically without grid
  const audioOnly = supported.every((a) => a.type === "audio");
  if (audioOnly) {
    return (
      <div style={{ display: "grid", gap: "var(--space-2)" }}>
        {supported.map((attachment) => (
          <MediaAttachment
            key={attachment.id}
            attachment={attachment}
            sensitive={sensitive}
            revealed={revealed}
            onReveal={() => setRevealed(true)}
          />
        ))}
      </div>
    );
  }

  // Single media item — full width
  if (supported.length === 1) {
    return (
      <MediaAttachment
        attachment={supported[0]}
        sensitive={sensitive}
        revealed={revealed}
        onReveal={() => setRevealed(true)}
      />
    );
  }

  // Multiple items — grid layout
  const gridStyle = getGridStyle(supported.length);

  return (
    <div style={gridStyle}>
      {supported.slice(0, 4).map((attachment, index) => (
        <div
          key={attachment.id}
          style={getItemStyle(supported.length, index)}
        >
          <MediaAttachment
            attachment={attachment}
            sensitive={sensitive}
            compact={supported.length === 2}
            filled={supported.length >= 3}
            revealed={revealed}
            onReveal={() => setRevealed(true)}
          />
        </div>
      ))}
    </div>
  );
}

function getGridStyle(count: number): React.CSSProperties {
  if (count === 2) {
    return {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "var(--space-1)",
      borderRadius: "var(--radius-md)",
      overflow: "hidden"
    };
  }
  // 3 or 4+
  return {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gridTemplateRows: "1fr 1fr",
    gap: "var(--space-1)",
    borderRadius: "var(--radius-md)",
    overflow: "hidden",
    aspectRatio: "16 / 9"
  };
}

function getItemStyle(count: number, index: number): React.CSSProperties {
  if (count === 3 && index === 0) {
    return { gridRow: "1 / -1" };
  }
  return {};
}
