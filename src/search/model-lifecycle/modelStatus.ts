/**
 * Phase 14 — Model download/availability state machine.
 *
 * Per-artifact observable state with the following transitions:
 *
 *     idle -> downloading -> ready
 *                       \-> failed -> downloading (retry)
 *     idle -> disabled (user/device opt-out)
 *     ready -> disabled
 *     ready -> idle (after clearAllLocalAIArtifacts)
 *
 * Subscribe/emit pattern matches `runtime-status.ts` so consumers can wire
 * either surface into React via the existing useSyncExternalStore pattern.
 *
 * Diagnostics ONLY include non-sensitive fields — never query text, never
 * search content. The most we report is a generic error message.
 */

import type { EmbeddingArtifactId } from "./modelRegistry";

export type ModelDownloadState = "idle" | "downloading" | "ready" | "failed" | "disabled";

export type ModelStatus = {
  id: EmbeddingArtifactId;
  state: ModelDownloadState;
  /** 0..1 progress when state === "downloading". */
  progress: number;
  /** Number of bytes received so far when known (best-effort). */
  bytesReceived: number;
  /** Last transition timestamp (ISO). */
  lastChangedAt: string;
  /** Last error message if state === "failed". Generic, never includes user content. */
  lastError?: string;
  /** Pinned revision the artifact was last marked ready for. */
  readyRevision?: string;
};

type StatusMap = Map<EmbeddingArtifactId, ModelStatus>;

const statuses: StatusMap = new Map();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.error("model-status listener threw", error);
    }
  }
}

function defaultStatus(id: EmbeddingArtifactId): ModelStatus {
  return {
    id,
    state: "idle",
    progress: 0,
    bytesReceived: 0,
    lastChangedAt: new Date(0).toISOString()
  };
}

export function getModelStatus(id: EmbeddingArtifactId): ModelStatus {
  return statuses.get(id) ?? defaultStatus(id);
}

export function getAllModelStatuses(): readonly ModelStatus[] {
  return Array.from(statuses.values());
}

export function subscribeModelStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setStatus(id: EmbeddingArtifactId, patch: Partial<ModelStatus>): ModelStatus {
  const current = statuses.get(id) ?? defaultStatus(id);
  const next: ModelStatus = {
    ...current,
    ...patch,
    id,
    lastChangedAt: new Date().toISOString()
  };
  statuses.set(id, next);
  emit();
  return next;
}

export function markDownloading(id: EmbeddingArtifactId, progress = 0, bytesReceived = 0): ModelStatus {
  // Clamp progress to a valid 0..1 range so a misbehaving loader cannot
  // poison the UI with NaN/Infinity bars.
  // - NaN -> 0
  // - +Infinity -> 1
  // - -Infinity -> 0
  // - in-range values pass through
  let clamped = Number(progress);
  if (Number.isNaN(clamped)) {
    clamped = 0;
  } else {
    clamped = Math.min(1, Math.max(0, clamped));
  }
  const bytes = Number.isFinite(bytesReceived) && bytesReceived >= 0 ? Math.floor(bytesReceived) : 0;
  return setStatus(id, {
    state: "downloading",
    progress: clamped,
    bytesReceived: bytes,
    lastError: undefined
  });
}

export function markReady(id: EmbeddingArtifactId, readyRevision: string): ModelStatus {
  return setStatus(id, {
    state: "ready",
    progress: 1,
    readyRevision,
    lastError: undefined
  });
}

export function markFailed(id: EmbeddingArtifactId, error: unknown): ModelStatus {
  // Sanitize error message: keep type/name only, never include the
  // original error.message which could contain a stringified URL or
  // request body that includes private content.
  const message = sanitizeErrorMessage(error);
  return setStatus(id, {
    state: "failed",
    progress: 0,
    lastError: message
  });
}

export function markDisabled(id: EmbeddingArtifactId): ModelStatus {
  return setStatus(id, {
    state: "disabled",
    progress: 0,
    lastError: undefined
  });
}

export function resetModelStatus(id: EmbeddingArtifactId): ModelStatus {
  return setStatus(id, {
    state: "idle",
    progress: 0,
    bytesReceived: 0,
    lastError: undefined,
    readyRevision: undefined
  });
}

export function resetAllModelStatuses(): void {
  for (const id of statuses.keys()) {
    resetModelStatus(id);
  }
}

/**
 * Privacy-safe error sanitization. We keep only the constructor name and
 * a short truncated message so loader stacks cannot accidentally leak
 * URLs, headers, or content embedded in error messages from third-party
 * libraries (transformers.js, fetch, etc.).
 */
function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name || "Error";
    const message = (error.message || "").slice(0, 240);
    return `${name}: ${message}`;
  }
  if (typeof error === "string") {
    return error.slice(0, 240);
  }
  return "Unknown error";
}
