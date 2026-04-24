import { FetchQueue } from '../sync/fetch-queue';
import { normalizeRemoteHttpUrl } from '../sync/safe-url';
import { initializeDatabase } from './client';

const queue = new FetchQueue();

function nowIso(): string {
  return new Date().toISOString();
}

async function fetchJson(url: string): Promise<any> {
  return queue.run(url, async (signal) => {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      const err: any = new Error(`HTTP ${res.status}`);
      err.retryable = res.status >= 500 || res.status === 429;
      throw err;
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) {
      throw new Error('Invalid content type');
    }
    return res.json();
  });
}

export async function enrichEntityLinks(entity: { id: string; kind: string; title?: string; name?: string }) {
  const query = (entity.title || entity.name || '').trim();
  if (!query) return;

  const db = await initializeDatabase();
  const timestamp = nowIso();

  const wikidataUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&limit=3&origin=*`;
  const dbpediaUrl = `https://lookup.dbpedia.org/api/search?query=${encodeURIComponent(query)}&format=JSON&maxResults=3`;

  const [wikidata, dbpedia] = await Promise.allSettled([
    fetchJson(wikidataUrl),
    fetchJson(dbpediaUrl)
  ]);

  const links: any[] = [];

  if (wikidata.status === 'fulfilled' && Array.isArray(wikidata.value.search)) {
    for (const item of wikidata.value.search) {
      links.push({
        id: `${entity.id}:wikidata:${item.id}`,
        entityId: entity.id,
        entityType: entity.kind,
        source: 'wikidata',
        externalId: item.id,
        externalUri: item.concepturi,
        label: item.label,
        description: item.description,
        confidence: item.score ?? 0.5,
        query,
        checkedAt: timestamp,
        updatedAt: timestamp
      });
    }
  }

  if (dbpedia.status === 'fulfilled' && Array.isArray(dbpedia.value.docs)) {
    for (const item of dbpedia.value.docs) {
      links.push({
        id: `${entity.id}:dbpedia:${item.resource?.[0]}`,
        entityId: entity.id,
        entityType: entity.kind,
        source: 'dbpedia',
        externalId: item.resource?.[0],
        externalUri: item.resource?.[0],
        label: item.label?.[0],
        description: item.comment?.[0],
        confidence: 0.5,
        query,
        checkedAt: timestamp,
        updatedAt: timestamp
      });
    }
  }

  for (const link of links) {
    try {
      await db.entitylinks.upsert(link);
    } catch {}
  }
}
