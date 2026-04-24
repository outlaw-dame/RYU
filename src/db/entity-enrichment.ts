import { FetchQueue } from '../sync/fetch-queue';
import { initializeDatabase } from './client';
import type { ExternalEntitySource } from './schema';

export type KnowledgeEntityKind = 'author' | 'work' | 'edition';

export type KnowledgeEntityCandidate = {
  id: string;
  kind: KnowledgeEntityKind;
  label: string;
  authorLabels?: string[];
  description?: string;
};

type ExternalLinkCandidate = {
  source: ExternalEntitySource;
  externalId: string;
  externalUri: string;
  label?: string;
  description?: string;
  confidence: number;
  query: string;
};

type WikidataSearchResponse = {
  search?: Array<{
    id?: string;
    concepturi?: string;
    label?: string;
    description?: string;
    score?: number;
  }>;
};

type DBpediaLookupResponse = {
  docs?: Array<{
    resource?: string[];
    label?: string[];
    comment?: string[];
  }>;
};

const queue = new FetchQueue({
  concurrency: 2,
  perHostConcurrency: 1,
  retries: 2,
  retryDelayMs: 750,
  timeoutMs: 8_000,
  jitterMs: 250
});

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function boundedQuery(candidate: KnowledgeEntityCandidate): string | null {
  const label = candidate.label.trim();
  if (!label || label.length > 256) return null;

  const authorContext = candidate.authorLabels?.filter(Boolean).slice(0, 2).join(' ');
  const query = [label, authorContext].filter(Boolean).join(' ').trim();
  return query.length > 256 ? query.slice(0, 256) : query;
}

async function fetchJson<T>(url: string, host: string): Promise<T> {
  return queue.run(url, async (signal) => {
    const res = await fetch(url, {
      signal,
      headers: {
        Accept: 'application/json'
      }
    });

    if (!res.ok) {
      const err = new Error(`Knowledge lookup failed with HTTP ${res.status}`) as Error & { retryable?: boolean };
      err.retryable = res.status === 408 || res.status === 425 || res.status === 429 || res.status >= 500;
      throw err;
    }

    const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('json')) {
      throw new Error(`Invalid knowledge lookup content type: ${contentType || 'unknown'}`);
    }

    return res.json() as Promise<T>;
  }, { host });
}

function labelConfidence(queryLabel: string, candidateLabel?: string, sourceScore?: number): number {
  if (!candidateLabel) return 0.25;

  const query = normalizeText(queryLabel);
  const label = normalizeText(candidateLabel);
  if (!query || !label) return 0.25;

  let score = 0.35;
  if (query === label) score = 0.95;
  else if (label.includes(query) || query.includes(label)) score = 0.72;
  else {
    const queryTokens = new Set(query.split(' '));
    const labelTokens = new Set(label.split(' '));
    const overlap = [...queryTokens].filter((token) => labelTokens.has(token)).length;
    score = Math.max(score, Math.min(0.7, overlap / Math.max(queryTokens.size, 1)));
  }

  if (typeof sourceScore === 'number' && Number.isFinite(sourceScore)) {
    score = Math.max(score, Math.min(1, sourceScore));
  }

  return Math.round(score * 100) / 100;
}

async function queryWikidata(candidate: KnowledgeEntityCandidate, query: string): Promise<ExternalLinkCandidate[]> {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&limit=5&origin=*`;
  const response = await fetchJson<WikidataSearchResponse>(url, 'www.wikidata.org');
  const results = response.search ?? [];

  return results
    .filter((item) => item.id && item.concepturi)
    .map((item) => ({
      source: 'wikidata' as const,
      externalId: item.id!,
      externalUri: item.concepturi!,
      label: item.label,
      description: item.description,
      confidence: labelConfidence(candidate.label, item.label, item.score),
      query
    }));
}

async function queryDBpedia(candidate: KnowledgeEntityCandidate, query: string): Promise<ExternalLinkCandidate[]> {
  const url = `https://lookup.dbpedia.org/api/search?query=${encodeURIComponent(query)}&format=JSON&maxResults=5`;
  const response = await fetchJson<DBpediaLookupResponse>(url, 'lookup.dbpedia.org');
  const docs = response.docs ?? [];

  return docs
    .filter((item) => item.resource?.[0])
    .map((item) => ({
      source: 'dbpedia' as const,
      externalId: item.resource![0],
      externalUri: item.resource![0],
      label: item.label?.[0],
      description: item.comment?.[0],
      confidence: labelConfidence(candidate.label, item.label?.[0]),
      query
    }));
}

function dedupeCandidates(candidates: ExternalLinkCandidate[]): ExternalLinkCandidate[] {
  const byKey = new Map<string, ExternalLinkCandidate>();

  for (const candidate of candidates) {
    const key = `${candidate.source}:${candidate.externalUri}`;
    const existing = byKey.get(key);
    if (!existing || candidate.confidence > existing.confidence) {
      byKey.set(key, candidate);
    }
  }

  return [...byKey.values()]
    .filter((candidate) => candidate.confidence >= 0.35)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);
}

export async function enrichKnowledgeEntity(candidate: KnowledgeEntityCandidate): Promise<void> {
  const query = boundedQuery(candidate);
  if (!query) return;

  const [wikidata, dbpedia] = await Promise.allSettled([
    queryWikidata(candidate, query),
    queryDBpedia(candidate, query)
  ]);

  const candidates = dedupeCandidates([
    ...(wikidata.status === 'fulfilled' ? wikidata.value : []),
    ...(dbpedia.status === 'fulfilled' ? dbpedia.value : [])
  ]);

  if (candidates.length === 0) return;

  const db = await initializeDatabase();
  const timestamp = nowIso();

  for (const link of candidates) {
    try {
      await db.entitylinks.upsert({
        id: `${candidate.id}:${link.source}:${link.externalId}`,
        entityId: candidate.id,
        entityType: candidate.kind,
        source: link.source,
        externalId: link.externalId,
        externalUri: link.externalUri,
        label: link.label,
        description: link.description,
        confidence: link.confidence,
        query: link.query,
        checkedAt: timestamp,
        updatedAt: timestamp
      });
    } catch {
      // External enrichment is intentionally best-effort. ActivityPub ingestion
      // remains authoritative and must not fail because a knowledge source is
      // unavailable or returns a shape we reject.
    }
  }
}
