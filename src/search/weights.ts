const KEY = 'ryu.search.weights.v1';
const MAX_RECORDS = 200;
const MIN_SAMPLES = 3;
const DAY_MS = 1000 * 60 * 60 * 24;

export type WeightRecord = {
  intent: string;
  alpha: number;
  timestamp: number;
};

function clampAlpha(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0.1, Math.min(0.9, value));
}

function load(): WeightRecord[] {
  if (typeof localStorage === 'undefined') return [];

  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is WeightRecord =>
        item &&
        typeof item.intent === 'string' &&
        typeof item.alpha === 'number' &&
        typeof item.timestamp === 'number'
      )
      .map((item) => ({
        intent: item.intent,
        alpha: clampAlpha(item.alpha),
        timestamp: item.timestamp
      }));
  } catch {
    return [];
  }
}

function save(records: WeightRecord[]): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(KEY, JSON.stringify(records.slice(-MAX_RECORDS)));
  } catch {
    // Quota pressure should never break search.
  }
}

export function recordAlphaFeedback(intent: string, alpha: number): void {
  const records = load();

  records.push({
    intent,
    alpha: clampAlpha(alpha),
    timestamp: Date.now()
  });

  save(records);
}

export function getAdaptiveAlpha(baseAlpha: number, intent: string): number {
  const records = load().filter((record) => record.intent === intent);

  if (records.length < MIN_SAMPLES) return clampAlpha(baseAlpha);

  const now = Date.now();
  let weightedSum = 0;
  let totalWeight = 0;

  for (const record of records) {
    const ageDays = Math.max(0, (now - record.timestamp) / DAY_MS);
    const weight = Math.exp(-ageDays / 7);

    weightedSum += record.alpha * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) return clampAlpha(baseAlpha);

  return clampAlpha(weightedSum / totalWeight);
}

export function resetAdaptiveWeights(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(KEY);
}
