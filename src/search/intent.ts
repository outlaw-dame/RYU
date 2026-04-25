import type { SearchEntityType } from './types';

export type SearchIntent =
  | 'isbn'
  | 'author'
  | 'title'
  | 'semantic'
  | 'format'
  | 'general';

export type QueryIntent = {
  intent: SearchIntent;
  alpha: number;
  preferredTypes: Partial<Record<SearchEntityType, number>>;
  reasons: string[];
};

const ISBN_RE = /(?:97[89][\- ]?)?(?:\d[\- ]?){9,12}[\dXx]/;
const AUTHOR_HINT_RE = /\b(author|by|writer|novelist|poet|books by)\b/i;
const FORMAT_HINT_RE = /\b(audiobook|audio book|ebook|e-book|kindle|paperback|hardcover|graphic novel|manga|comic)\b/i;
const SEMANTIC_HINT_RE = /\b(about|like|similar|themes?|topics?|recommend|recommendation|vibe|mood|identity|memory|grief|history|philosophy|science)\b/i;

export function classifyQueryIntent(query: string): QueryIntent {
  const normalized = query.trim();
  const reasons: string[] = [];

  if (ISBN_RE.test(normalized.replace(/\s+/g, ''))) {
    return {
      intent: 'isbn',
      alpha: 0.15,
      preferredTypes: { edition: 4 },
      reasons: ['isbn-query']
    };
  }

  if (FORMAT_HINT_RE.test(normalized)) {
    return {
      intent: 'format',
      alpha: 0.35,
      preferredTypes: { edition: 3, work: 1 },
      reasons: ['format-query']
    };
  }

  if (AUTHOR_HINT_RE.test(normalized)) {
    return {
      intent: 'author',
      alpha: 0.35,
      preferredTypes: { author: 3, work: 1 },
      reasons: ['author-query']
    };
  }

  if (SEMANTIC_HINT_RE.test(normalized) || normalized.split(/\s+/).length >= 5) {
    return {
      intent: 'semantic',
      alpha: 0.75,
      preferredTypes: { work: 1.5, edition: 1 },
      reasons: ['semantic-query']
    };
  }

  if (normalized.length <= 48) {
    return {
      intent: 'title',
      alpha: 0.3,
      preferredTypes: { edition: 2, work: 1 },
      reasons: ['title-query']
    };
  }

  reasons.push('general-query');
  return {
    intent: 'general',
    alpha: 0.5,
    preferredTypes: { edition: 1, work: 1 },
    reasons
  };
}
