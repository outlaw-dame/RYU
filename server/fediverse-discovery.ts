/**
 * Server-side fediverse instance discovery.
 *
 * This is a self-contained module with NO imports that use the @/db path alias.
 * It is intentionally separate from src/sync/instance-discovery.ts so that
 * vite.config.ts can import the auth middleware without pulling in browser-only
 * RxDB code via the @/db alias chain.
 *
 * Fetches instances from FediDB + Oliphant Tier 0 blocklist only.
 * BookWyrm database instances (browser-only) are skipped on the server.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FEDIDB_SERVERS_URL = "https://api.fedidb.org/v1/servers";
const OLIPHANT_TIER0_URLS = [
  "https://codeberg.org/oliphant/blocklists/raw/branch/main/blocklists/mastodon/_unified_tier0_blocklist.csv",
  "https://codeberg.org/oliphant/blocklists/raw/branch/main/blocklists/_unified_tier0_blocklist.csv"
];
const FEDIDB_MAX_PAGES = 4;
const FEDIDB_DEFAULT_LIMIT = 40;
const FEDIDB_CACHE_TTL_MS = 1000 * 60 * 60;
const OLIPHANT_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const FEDIDB_COMPATIBLE_SOFTWARE = new Set(["mastodon", "bookwyrm", "hometown", "glitch-soc"]);

// ---------------------------------------------------------------------------
// Types (mirrors src/sync/instance-discovery.ts)
// ---------------------------------------------------------------------------

export type DiscoveryRegistrationStatus = "open" | "invite" | "closed" | "unknown";

export type FediverseInstance = {
  domain: string;
  url: string;
  name: string;
  description?: string;
  country?: string;
  city?: string;
  softwareName?: string;
  softwareSlug?: string;
  userCount?: number;
  source: "bookwyrm" | "fedidb";
  registrationStatus: DiscoveryRegistrationStatus;
  openRegistration: boolean;
  mastodonApiCompatible: boolean;
  blockedByTier0: boolean;
};

export type DiscoverFediverseInstancesOptions = {
  signupOnly?: boolean;
  mastodonApiCompatibleOnly?: boolean;
  force?: boolean;
  preferredSoftwareSlugs?: string[];
  preferredCountry?: string;
  searchQuery?: string;
  limit?: number;
};

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const fedidbServerSchema = z.object({
  domain: z.string().min(1),
  open_registration: z.boolean().nullable().optional(),
  description: z.string().nullable().optional(),
  location: z
    .object({
      city: z.string().nullable().optional(),
      country: z.string().nullable().optional()
    })
    .nullable()
    .optional(),
  software: z
    .object({
      name: z.string().nullable().optional(),
      slug: z.string().nullable().optional()
    })
    .nullable()
    .optional(),
  stats: z
    .object({
      user_count: z.number().nullable().optional()
    })
    .nullable()
    .optional()
});

const fedidbServersResponseSchema = z.object({
  data: z.array(fedidbServerSchema),
  links: z
    .object({
      next: z.string().url().nullable().optional()
    })
    .optional()
});

// ---------------------------------------------------------------------------
// Module-level caches
// ---------------------------------------------------------------------------

type Tier0Cache = { fetchedAt: number; domains: Set<string> };
let tier0Cache: Tier0Cache | null = null;
let fedidbCache: { fetchedAt: number; servers: z.infer<typeof fedidbServerSchema>[] } | null = null;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function computeBackoffMs(attempts: number, baseMs = 300, maxMs = 2500): number {
  const exponential = Math.min(maxMs, baseMs * 2 ** attempts);
  const jitter = Math.floor(Math.random() * Math.min(1000, exponential * 0.25));
  return exponential + jitter;
}

function normalizeDomain(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/^"|"$/g, "").replace(/^\*\./, "");
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return parsed.hostname.replace(/\.$/, "");
  } catch {
    return trimmed
      .replace(/^https?:\/\//, "")
      .split(/[/?#]/, 1)[0]
      .split(":", 1)[0]
      .replace(/\.$/, "");
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseCsvFirstField(line: string): string {
  let field = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      break;
    }

    field += char;
  }

  return field.trim();
}

function parseTier0Csv(csv: string): Set<string> {
  const domains = new Set<string>();
  const lines = csv.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const firstField = parseCsvFirstField(trimmed);
    const domain = normalizeDomain(firstField);
    if (!domain || domain === "domain") continue;

    domains.add(domain);
  }

  return domains;
}

function isDomainBlocked(domain: string, blockedDomains: Set<string>): boolean {
  let candidate = normalizeDomain(domain);

  while (candidate) {
    if (blockedDomains.has(candidate)) return true;
    const dotIndex = candidate.indexOf(".");
    if (dotIndex < 0) break;
    candidate = candidate.slice(dotIndex + 1);
  }

  return false;
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return response;

      if (response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500) {
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, computeBackoffMs(attempt)));
          continue;
        }
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, computeBackoffMs(attempt)));
      }
    }
  }

  throw lastError ?? new Error("Network request failed");
}

async function fetchOliphantTier0Domains(force = false): Promise<Set<string>> {
  if (!force && tier0Cache && Date.now() - tier0Cache.fetchedAt < OLIPHANT_CACHE_TTL_MS) {
    return tier0Cache.domains;
  }

  let lastError: Error | null = null;

  for (const url of OLIPHANT_TIER0_URLS) {
    try {
      const response = await fetchWithRetry(url, { headers: { Accept: "text/csv,text/plain" } });

      if (!response.ok) {
        lastError = new Error(`Failed to fetch Oliphant Tier 0 blocklist (${response.status})`);
        continue;
      }

      const csv = await response.text();
      const domains = parseTier0Csv(csv);
      if (domains.size === 0) {
        lastError = new Error("Oliphant Tier 0 blocklist was empty");
        continue;
      }

      tier0Cache = { fetchedAt: Date.now(), domains };
      return domains;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  if (tier0Cache && tier0Cache.domains.size > 0) {
    return tier0Cache.domains;
  }

  throw lastError ?? new Error("Failed to fetch Oliphant Tier 0 blocklist");
}

async function fetchFedidbServers(force = false): Promise<z.infer<typeof fedidbServerSchema>[]> {
  if (!force && fedidbCache && Date.now() - fedidbCache.fetchedAt < FEDIDB_CACHE_TTL_MS) {
    return fedidbCache.servers;
  }

  const servers: z.infer<typeof fedidbServerSchema>[] = [];
  let nextUrl: string | null = `${FEDIDB_SERVERS_URL}?limit=${FEDIDB_DEFAULT_LIMIT}`;
  let pages = 0;

  while (nextUrl && pages < FEDIDB_MAX_PAGES) {
    const response = await fetchWithRetry(nextUrl, { headers: { Accept: "application/json" } });

    if (!response.ok) {
      throw new Error(`Failed to fetch FediDB servers (${response.status})`);
    }

    const json = fedidbServersResponseSchema.parse(await response.json());
    servers.push(...json.data);
    nextUrl = json.links?.next ?? null;
    pages += 1;
  }

  fedidbCache = { fetchedAt: Date.now(), servers };
  return servers;
}

function fromFedidbServer(server: z.infer<typeof fedidbServerSchema>): FediverseInstance {
  const domain = normalizeDomain(server.domain);
  const softwareSlug = server.software?.slug ? normalizeDomain(server.software.slug) : undefined;
  const softwareName = server.software?.name ?? undefined;
  const openRegistration = server.open_registration === true;
  const mastodonApiCompatible = softwareSlug ? FEDIDB_COMPATIBLE_SOFTWARE.has(softwareSlug) : false;

  return {
    domain,
    url: `https://${domain}`,
    name: domain,
    description: server.description ?? undefined,
    country: server.location?.country ?? undefined,
    city: server.location?.city ?? undefined,
    softwareName,
    softwareSlug,
    userCount: server.stats?.user_count ?? undefined,
    source: "fedidb",
    registrationStatus: openRegistration ? "open" : "closed",
    openRegistration,
    mastodonApiCompatible,
    blockedByTier0: false
  };
}

function mergeInstances(instances: FediverseInstance[]): FediverseInstance[] {
  const byDomain = new Map<string, FediverseInstance>();

  for (const instance of instances) {
    if (!instance.domain) continue;

    const existing = byDomain.get(instance.domain);
    if (!existing) {
      byDomain.set(instance.domain, instance);
      continue;
    }

    byDomain.set(instance.domain, {
      ...existing,
      name: existing.name === existing.domain ? instance.name : existing.name,
      description: existing.description ?? instance.description,
      softwareName: existing.softwareName ?? instance.softwareName,
      softwareSlug: existing.softwareSlug ?? instance.softwareSlug,
      country: existing.country ?? instance.country,
      city: existing.city ?? instance.city,
      userCount: Math.max(existing.userCount ?? 0, instance.userCount ?? 0) || undefined,
      source: existing.source,
      registrationStatus:
        existing.registrationStatus === "open" || instance.registrationStatus === "open"
          ? "open"
          : existing.registrationStatus,
      openRegistration: existing.openRegistration || instance.openRegistration,
      mastodonApiCompatible: existing.mastodonApiCompatible || instance.mastodonApiCompatible,
      blockedByTier0: existing.blockedByTier0 || instance.blockedByTier0
    });
  }

  return Array.from(byDomain.values());
}

function scoreInstance(
  instance: FediverseInstance,
  preferredSoftware: Set<string>,
  preferredCountry?: string,
  search?: string
): number {
  let score = 0;
  if (instance.openRegistration) score += 120;
  if (instance.mastodonApiCompatible) score += 80;

  if (preferredSoftware.size > 0 && instance.softwareSlug && preferredSoftware.has(instance.softwareSlug.toLowerCase())) {
    score += 60;
  }

  if (preferredCountry && instance.country?.toLowerCase() === preferredCountry) {
    score += 40;
  }

  if (search) {
    const haystack = [instance.domain, instance.name, instance.softwareName, instance.country, instance.city]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (haystack.includes(search)) {
      score += 70;
    }
  }

  if (typeof instance.userCount === "number" && Number.isFinite(instance.userCount)) {
    score += Math.log10(Math.max(instance.userCount, 1));
  }

  if (instance.source === "bookwyrm") {
    score += 15;
  }

  return score;
}

function rankInstances(instances: FediverseInstance[], options: DiscoverFediverseInstancesOptions): FediverseInstance[] {
  const preferredSoftware = new Set((options.preferredSoftwareSlugs ?? []).map((slug) => slug.toLowerCase()));
  const preferredCountry = options.preferredCountry?.trim().toLowerCase();
  const search = options.searchQuery?.trim().toLowerCase();

  return [...instances].sort((a, b) => {
    const scoreA = scoreInstance(a, preferredSoftware, preferredCountry, search);
    const scoreB = scoreInstance(b, preferredSoftware, preferredCountry, search);
    if (scoreA !== scoreB) return scoreB - scoreA;
    const userDelta = (b.userCount ?? 0) - (a.userCount ?? 0);
    if (userDelta !== 0) return userDelta;
    return a.domain.localeCompare(b.domain);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function discoverFediverseInstances(
  options: DiscoverFediverseInstancesOptions = {}
): Promise<FediverseInstance[]> {
  const signupOnly = options.signupOnly ?? true;
  const mastodonApiCompatibleOnly = options.mastodonApiCompatibleOnly ?? true;

  const [fedidbResult, tier0Result] = await Promise.allSettled([
    fetchFedidbServers(options.force === true),
    fetchOliphantTier0Domains(options.force === true)
  ]);

  if (tier0Result.status === "rejected") {
    throw new Error("Instance discovery unavailable: safety blocklist could not be loaded.");
  }

  const candidates: FediverseInstance[] = [];

  if (fedidbResult.status === "fulfilled") {
    candidates.push(...fedidbResult.value.map(fromFedidbServer));
  }

  const blockedDomains = tier0Result.value;

  const merged = mergeInstances(
    candidates.map((instance) => ({
      ...instance,
      blockedByTier0: isDomainBlocked(instance.domain, blockedDomains)
    }))
  );

  const filtered = merged.filter((instance) => {
    if (instance.blockedByTier0) return false;
    if (mastodonApiCompatibleOnly && !instance.mastodonApiCompatible) return false;
    if (signupOnly && !instance.openRegistration) return false;
    return true;
  });

  const ranked = rankInstances(filtered, options);
  const limit = options.limit && options.limit > 0 ? Math.floor(options.limit) : undefined;
  return typeof limit === "number" ? ranked.slice(0, limit) : ranked;
}

export function getInstanceDiscoverySnapshot(instances: FediverseInstance[]) {
  return {
    generatedAt: nowIso(),
    total: instances.length,
    domains: instances.map((instance) => instance.domain)
  };
}
