import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./bookwyrm-instances", () => ({
  fetchBookWyrmInstances: vi.fn()
}));

const originalFetch = globalThis.fetch;

describe("discoverFediverseInstances", () => {
  afterEach(() => {
    if (originalFetch) {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        writable: true,
        value: originalFetch
      });
    } else {
      Reflect.deleteProperty(globalThis, "fetch");
    }

    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("filters exact and subdomain matches from the Oliphant Tier 0 blocklist", async () => {
    const { discoverFediverseInstances, fetchBookWyrmInstances } = await loadDiscoveryModules();
    vi.mocked(fetchBookWyrmInstances).mockResolvedValue([
      bookwyrmRecord("blocked.example"),
      bookwyrmRecord("safe-book.example")
    ]);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("codeberg.org/oliphant")) {
        return textResponse([
          "#domain,#severity",
          "blocked.example,suspend",
          "parent.example,suspend"
        ].join("\n"));
      }

      return jsonResponse(fedidbServers([
        fedidbServer("blocked.example"),
        fedidbServer("child.parent.example"),
        fedidbServer("safe.example")
      ]));
    });
    vi.stubGlobal("fetch", fetchMock);

    const instances = await discoverFediverseInstances({ force: true, limit: 20 });
    const domains = instances.map((instance) => instance.domain);

    expect(domains).toContain("safe-book.example");
    expect(domains).toContain("safe.example");
    expect(domains).not.toContain("blocked.example");
    expect(domains).not.toContain("child.parent.example");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/blocklists/mastodon/_unified_tier0_blocklist.csv"))).toBe(true);
  });

  it("fails closed when the safety blocklist cannot be loaded and no cache exists", async () => {
    const { discoverFediverseInstances, fetchBookWyrmInstances } = await loadDiscoveryModules();
    vi.mocked(fetchBookWyrmInstances).mockResolvedValue([bookwyrmRecord("safe-book.example")]);

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("codeberg.org/oliphant")) {
        return new Response("not found", { status: 404 });
      }

      return jsonResponse(fedidbServers([fedidbServer("safe.example")]));
    }));

    await expect(discoverFediverseInstances({ force: true })).rejects.toThrow("safety blocklist");
  });

  it("keeps filtering with a stale blocklist cache when refresh fails", async () => {
    const { discoverFediverseInstances, fetchBookWyrmInstances } = await loadDiscoveryModules();
    vi.mocked(fetchBookWyrmInstances).mockResolvedValue([]);

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("codeberg.org/oliphant")) {
        return textResponse("blocked.example,suspend");
      }

      return jsonResponse(fedidbServers([
        fedidbServer("blocked.example"),
        fedidbServer("safe.example")
      ]));
    }));

    await expect(discoverFediverseInstances({ force: true })).resolves.toHaveLength(1);

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("codeberg.org/oliphant")) {
        return new Response("not found", { status: 404 });
      }

      return jsonResponse(fedidbServers([
        fedidbServer("blocked.example"),
        fedidbServer("safe.example")
      ]));
    }));

    const instances = await discoverFediverseInstances({ force: true });
    expect(instances.map((instance) => instance.domain)).toEqual(["safe.example"]);
  });
});

async function loadDiscoveryModules() {
  vi.resetModules();
  const bookwyrmModule = await import("./bookwyrm-instances");
  const discoveryModule = await import("./instance-discovery");

  return {
    fetchBookWyrmInstances: bookwyrmModule.fetchBookWyrmInstances,
    discoverFediverseInstances: discoveryModule.discoverFediverseInstances
  };
}

function bookwyrmRecord(domain: string) {
  return {
    id: domain,
    domain,
    url: `https://${domain}`,
    name: domain,
    registrationStatus: "open",
    source: "joinbookwyrm",
    fetchedAt: "2026-04-29T00:00:00.000Z",
    updatedAt: "2026-04-29T00:00:00.000Z"
  };
}

function fedidbServer(domain: string) {
  return {
    domain,
    open_registration: true,
    software: {
      name: "BookWyrm",
      slug: "bookwyrm"
    },
    stats: {
      user_count: 10
    }
  };
}

function fedidbServers(data: unknown[]) {
  return {
    data,
    links: {
      next: null
    }
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function textResponse(payload: string): Response {
  return new Response(payload, {
    status: 200,
    headers: { "Content-Type": "text/csv" }
  });
}
