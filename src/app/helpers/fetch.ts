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
 * Fetch with exponential backoff, timeout, and abort propagation.
 *
 * Retries on retryable HTTP status codes (408, 425, 429, 5xx).
 * Respects external AbortSignal so callers can cancel in-flight requests.
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
        await new Promise((resolve) => window.setTimeout(resolve, computeClientBackoffMs(attempt)));
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
        await new Promise((resolve) => window.setTimeout(resolve, computeClientBackoffMs(attempt)));
      }
    }
  }

  throw lastError ?? new Error("Network request failed");
}
