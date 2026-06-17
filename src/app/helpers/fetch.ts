/**
 * Phase 23 — Shared fetch utilities extracted from App.tsx.
 *
 * Provides resilient HTTP fetching with exponential backoff,
 * timeout handling, and abort signal forwarding.
 */

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Compute client-side backoff delay with jitter.
 */
export function computeClientBackoffMs(attempt: number, baseMs = 200, capMs = 1800): number {
  const jitter = Math.floor(Math.random() * 120);
  return Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1) + jitter);
}

/**
 * Abort-aware delay: resolves after `ms` or rejects immediately if the
 * signal is aborted (so the UI doesn't block during backoff).
 */
function abortableDelay(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timeoutId);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Fetch with exponential backoff, timeout, and abort propagation.
 *
 * Retries on retryable HTTP status codes (408, 425, 429, 5xx).
 * Respects external AbortSignal so callers can cancel in-flight requests
 * and backoff delays immediately.
 */
export async function fetchWithBackoff(
  url: string,
  init: RequestInit,
  attempts = 3,
  timeoutMs = 12_000
): Promise<Response> {
  let lastError: Error | null = null;
  const { signal: externalSignal, ...initWithoutSignal } = init;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    if (externalSignal?.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });
    }

    try {
      const response = await fetch(url, {
        ...initWithoutSignal,
        signal: controller.signal
      });
      window.clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", abortFromExternalSignal);

      if (response.ok) {
        return response;
      }

      if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < attempts) {
        await abortableDelay(computeClientBackoffMs(attempt), externalSignal);
        continue;
      }

      return response;
    } catch (error) {
      window.clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", abortFromExternalSignal);
      if (externalSignal?.aborted) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts) {
        await abortableDelay(computeClientBackoffMs(attempt), externalSignal);
      }
    }
  }

  throw lastError ?? new Error("Network request failed");
}
