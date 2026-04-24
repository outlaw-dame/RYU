import { getDatabase } from '@/db/client';

const SOURCE_URL = 'https://joinbookwyrm.com/instances/';
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24h

function now() {
  return new Date().toISOString();
}

function parseRegistration(text: string): 'open' | 'invite' | 'closed' | 'unknown' {
  const t = text.toLowerCase();
  if (t.includes('join instance')) return 'open';
  if (t.includes('request invite')) return 'invite';
  if (t.includes('closed')) return 'closed';
  return 'unknown';
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function parseHtml(html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const links = Array.from(doc.querySelectorAll('a[href]'));
  const instances = new Map<string, any>();

  for (const link of links) {
    const href = (link as HTMLAnchorElement).href;

    if (!href.startsWith('http')) continue;
    if (href.includes('joinbookwyrm.com')) continue;

    const domain = extractDomain(href);

    if (instances.has(domain)) continue;

    const text = link.textContent || domain;

    instances.set(domain, {
      id: domain,
      domain,
      url: `https://${domain}`,
      name: text.trim(),
      registrationStatus: parseRegistration(text),
      source: 'joinbookwyrm',
      fetchedAt: now(),
      updatedAt: now()
    });
  }

  return Array.from(instances.values());
}

export async function fetchBookWyrmInstances(force = false) {
  const db = await getDatabase();

  const existing = await db.bookwyrminstances.find().exec();

  if (!force && existing.length) {
    const fresh = existing.every((d: any) => {
      const age = Date.now() - new Date(d.fetchedAt).getTime();
      return age < CACHE_TTL;
    });

    if (fresh) {
      return existing.map((d: any) => d.toJSON());
    }
  }

  const res = await fetch(SOURCE_URL, {
    headers: {
      'Accept': 'text/html'
    }
  });

  if (!res.ok) throw new Error('Failed to fetch instances');

  const html = await res.text();
  const parsed = parseHtml(html);

  const bulk = parsed.map((doc) => ({
    document: doc
  }));

  await db.bookwyrminstances.bulkUpsert(bulk);

  return parsed;
}
