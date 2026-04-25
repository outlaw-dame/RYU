const DEFAULT_DIMENSIONS = 128;

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashToken(token: string): number {
  let hash = 2166136261;

  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function l2Normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

export function embedText(text: string, dimensions = DEFAULT_DIMENSIONS): number[] {
  const normalized = normalizeText(text);
  const vector = new Array(dimensions).fill(0);
  if (!normalized) return vector;

  const tokens = normalized.split(' ');

  for (const token of tokens) {
    const hash = hashToken(token);
    const index = hash % dimensions;
    const sign = hash & 1 ? 1 : -1;
    vector[index] += sign;

    // Add simple character 3-gram signal so related morphology has overlap.
    for (let i = 0; i <= Math.max(0, token.length - 3); i += 1) {
      const gram = token.slice(i, i + 3);
      const gramHash = hashToken(gram);
      vector[gramHash % dimensions] += (gramHash & 1 ? 0.35 : -0.35);
    }
  }

  return l2Normalize(vector);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;

  let dot = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
  }

  return Number.isFinite(dot) ? dot : 0;
}

export function searchableText(doc: { title: string; authorText?: string; description?: string; enrichmentText?: string }): string {
  return [doc.title, doc.authorText, doc.description, doc.enrichmentText]
    .filter(Boolean)
    .join(' ')
    .slice(0, 20_000);
}
