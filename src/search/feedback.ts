import { recordAlphaFeedback } from './weights';

type FeedbackEvent = {
  query: string;
  docId: string;
  reward: number;
  timestamp: number;
};

const KEY = 'ryu.search.feedback.v1';

function load(): FeedbackEvent[] {
  if (typeof localStorage === 'undefined') return [];

  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(events: FeedbackEvent[]) {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(KEY, JSON.stringify(events.slice(-500)));
  } catch {
    // ignore quota errors
  }
}

export function recordClick(query: string, docId: string, intent?: string, alpha?: number) {
  const events = load();
  events.push({ query, docId, reward: 1, timestamp: Date.now() });
  save(events);

  if (intent && typeof alpha === 'number') {
    recordAlphaFeedback(intent, alpha);
  }
}

export function getBoostForDoc(query: string, docId: string): number {
  const events = load();
  const recent = events.filter(e => e.query === query && e.docId === docId);

  if (recent.length === 0) return 0;

  // simple decay weighting
  const now = Date.now();
  let score = 0;

  for (const e of recent) {
    const age = (now - e.timestamp) / (1000 * 60 * 60 * 24);
    const weight = Math.exp(-age / 7); // 1 week decay
    score += e.reward * weight;
  }

  return Math.min(score, 3);
}
