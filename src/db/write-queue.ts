export type WriteQueueStatus = "pending" | "in_flight" | "failed" | "completed";
export type WriteOperation = { action: string; endpoint: string; payload: unknown };

export function computeBackoffMs(attempts: number, baseMs = 1000, maxMs = 60_000) {
  const exponential = Math.min(maxMs, baseMs * 2 ** attempts);
  const jitter = Math.floor(Math.random() * Math.min(1000, exponential * 0.25));
  return exponential + jitter;
}
