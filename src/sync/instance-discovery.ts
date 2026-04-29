import { z } from "zod";
import { fetchBookWyrmInstances } from "./bookwyrm-instances";
import { computeBackoffMs } from "../db/write-queue";

const FEDIDB_SERVERS_URL = "https://api.fedidb.org/v1/servers";
const OLIPHANT_TIER0_URL =
  "https://codeberg.org/oliphant/blocklists/raw/branch/main/blocklists/_unified_tier0_blocklist.csv";
const FEDIDB_MAX_PAGES = 4;
const FEDIDB_DEFAULT_LIMIT = 40;
const FEDIDB_CACHE_TTL_MS = 1000 * 60 * 60;
const OLIPHANT_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const FEDIDB_COMPATIBLE_SOFTWARE = new Set(["mastodon", "bookwyrm", "hometown", "glitch-soc"]);

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

type Tier0Cache = {
  fetchedAt: number;
  domains: Set<string>;
};

let tier0Cache: Tier0Cache | null = null;
let fedidbCache: { fetchedAt: number; servers: z.infer<typeof fedidbServerSchema>[] } | null = null;

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

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseTier0Csv(csv: string): Set<string> {
  const domains = new Set<string>();
  const lines = csv.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("domain,")) continue;

    const firstField = trimmed.split(",", 1)[0];
    const domain = normalizeDomain(firstField.replace(/^"|"$/g, ""));
    if (!domain || domain === "domain") continue;

    domains.add(domain);
  }

  return domains;
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return response;

      if (response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500) {
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, computeBackoffMs(attempt, 300, 2500)));
          continue;
        }
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, computeBackoffMs(attempt, 300, 2500)));
      }
    }
  }

  throw lastError ?? new Error("Network request failed");
}

async function fetchOliphantTier0Domains(force = false): Promise<Set<string>> {
  if (!force && tier0Cache && Date.now() - tier0Cache.fetchedAt < OLIPHANT_CACHE_TTL_MS) {
    return tier0Cache.domains;
  }

  const response = await fetchWithRetry(OLIPHANT_TIER0_URL, {
    headers: { Accept: "text/csv,text/plain" }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Oliphant Tier 0 blocklist (${response.status})`);
  }

  const csv = await response.text();
  const domains = parseTier0Csv(csv);
  tier0Cache = { fetchedAt: Date.now(), domains };
  return domains;
}

async function fetchFedidbServers(force = false): Promise<z.infer<typeof fedidbServerSchema>[]> {
  if (!force && fedidbCache && Date.now() - fedidbCache.fetchedAt < FEDIDB_CACHE_TTL_MS) {
    return fedidbCache.servers;
  }

  const servers: z.infer<typeof fedidbServerSchema>[] = [];
  let nextUrl: string | null = `${FEDIDB_SERVERS_URL}?limit=${FEDIDB_DEFAULT_LIMIT}`;
  let pages = 0;

  while (nextUrl && pages < FEDIDB_MAX_PAGES) {
    const response = await fetchWithRetry(nextUrl, {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch FediDB servers (${response.status})`);
    }

    const json = fedidbServersResponseSchema.parse(await response.json());
    servers.push(...json.data);
    nextUrl = json.links?.next ?? null;
    pages += 1;
  }

  fedidbCache = {
    fetchedAt: Date.now(),
    servers
  };

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

function fromBookWyrmRecord(record: any): FediverseInstance {
  const domain = normalizeDomain(String(record.domain ?? record.id ?? ""));
  const registrationStatus = (record.registrationStatus ?? "unknown") as DiscoveryRegistrationStatus;

  return {
    domain,
    url: String(record.url ?? `https://${domain}`),
    name: String(record.name ?? domain),
    description: record.description ? String(record.description) : undefined,
    country: undefined,
    city: undefined,
    softwareName: "BookWyrm",
    softwareSlug: "bookwyrm",
    userCount: typeof record.users === "number" ? record.users : undefined,
    source: "bookwyrm",
    registrationStatus,
    openRegistration: registrationStatus === "open",
    mastodonApiCompatible: true,
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

export async function discoverFediverseInstances(
  options: DiscoverFediverseInstancesOptions = {}
): Promise<FediverseInstance[]> {
  const signupOnly = options.signupOnly ?? true;
  const mastodonApiCompatibleOnly = options.mastodonApiCompatibleOnly ?? true;

  const [bookwyrmResult, fedidbResult, tier0Result] = await Promise.allSettled([
    fetchBookWyrmInstances(options.force === true),
    fetchFedidbServers(options.force === true),
    fetchOliphantTier0Domains(options.force === true)
  ]);

  const candidates: FediverseInstance[] = [];

  if (bookwyrmResult.status === "fulfilled") {
    candidates.push(...bookwyrmResult.value.map(fromBookWyrmRecord));
  }

  if (fedidbResult.status === "fulfilled") {
    candidates.push(...fedidbResult.value.map(fromFedidbServer));
  }

  const blockedDomains = tier0Result.status === "fulfilled" ? tier0Result.value : new Set<string>();

  const merged = mergeInstances(
    candidates.map((instance) => ({
      ...instance,
      blockedByTier0: blockedDomains.has(instance.domain)
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
