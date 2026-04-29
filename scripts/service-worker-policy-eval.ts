import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

function assertOk(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

type Listener = (event: any) => void;

type MockCache = {
  match(request: { url: string }): Promise<unknown | undefined>;
  put(request: { url: string }, response: MockResponse): Promise<void>;
  keys(): Promise<Array<{ url: string }>>;
  delete(request: { url: string }): Promise<boolean>;
};

class MockResponse {
  constructor(readonly body = '', readonly init: { status?: number; statusText?: string } = {}) {}
  get ok(): boolean { return (this.init.status ?? 200) >= 200 && (this.init.status ?? 200) < 300; }
  clone(): MockResponse { return new MockResponse(this.body, this.init); }
}

function createHarness() {
  const listeners = new Map<string, Listener[]>();
  const openedCaches: string[] = [];
  const storedRequests: Array<{ cacheName: string; url: string }> = [];
  const deletedCaches: string[] = [];
  const cacheEntries = new Map<string, Array<{ url: string }>>();

  function cacheFor(name: string): MockCache {
    if (!cacheEntries.has(name)) cacheEntries.set(name, []);
    return {
      async match() { return undefined; },
      async put(request, response) {
        if (!response.ok) return;
        storedRequests.push({ cacheName: name, url: request.url });
        cacheEntries.get(name)!.push({ url: request.url });
      },
      async keys() { return cacheEntries.get(name)!; },
      async delete(request) {
        const entries = cacheEntries.get(name)!;
        const index = entries.findIndex((entry) => entry.url === request.url);
        if (index >= 0) entries.splice(index, 1);
        return index >= 0;
      }
    };
  }

  const self = {
    location: { origin: 'https://app.example' },
    addEventListener(type: string, listener: Listener) {
      const existing = listeners.get(type) ?? [];
      existing.push(listener);
      listeners.set(type, existing);
    },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() }
  };

  const context = vm.createContext({
    self,
    URL,
    Response: MockResponse,
    Promise,
    Set,
    caches: {
      async keys() { return ['old-cache', 'ryu-static-v1', 'ryu-images-v1']; },
      async open(name: string) {
        openedCaches.push(name);
        return cacheFor(name);
      },
      async delete(name: string) {
        deletedCaches.push(name);
        return true;
      }
    },
    fetch: async () => new MockResponse('network', { status: 200 })
  });

  return {
    context,
    listeners,
    openedCaches,
    storedRequests,
    deletedCaches,
    async dispatchFetch(request: { method: string; url: string; destination?: string }) {
      let responsePromise: Promise<unknown> | null = null;
      const event = {
        request,
        respondWith(value: Promise<unknown>) { responsePromise = value; }
      };
      for (const listener of listeners.get('fetch') ?? []) listener(event);
      if (responsePromise) await responsePromise;
      return Boolean(responsePromise);
    },
    async dispatchActivate() {
      const waits: Array<Promise<unknown>> = [];
      const event = { waitUntil(value: Promise<unknown>) { waits.push(value); } };
      for (const listener of listeners.get('activate') ?? []) listener(event);
      await Promise.all(waits);
    }
  };
}

async function main(): Promise<void> {
  const source = await readFile('public/sw.js', 'utf8');
  const harness = createHarness();
  vm.runInContext(source, harness.context, { filename: 'public/sw.js' });

  assertOk((harness.listeners.get('fetch')?.length ?? 0) === 1, 'service worker should register one fetch listener');
  assertOk(await harness.dispatchFetch({ method: 'POST', url: 'https://app.example/assets/app.js' }) === false, 'non-GET requests must bypass service worker caching');
  assertOk(await harness.dispatchFetch({ method: 'GET', url: 'https://app.example/api/auth/mastodon/session' }) === false, 'auth API must bypass service worker caching');
  assertOk(await harness.dispatchFetch({ method: 'GET', url: 'https://app.example/api/trends/booktok' }) === false, 'JSON API responses must not be cached by the service worker');

  assertOk(await harness.dispatchFetch({ method: 'GET', url: 'https://app.example/assets/app.abc123.js' }) === true, 'hashed static assets should be handled by cache strategy');
  assertOk(harness.storedRequests.some((entry) => entry.cacheName === 'ryu-static-v1'), 'static assets should use the static cache');

  assertOk(await harness.dispatchFetch({ method: 'GET', url: 'https://cdn.example/covers/book.webp', destination: 'image' }) === true, 'image requests should be handled by cache strategy');
  assertOk(harness.storedRequests.some((entry) => entry.cacheName === 'ryu-images-v1'), 'images should use the bounded image cache');

  await harness.dispatchActivate();
  assertOk(harness.deletedCaches.includes('old-cache'), 'activation should delete old caches');
  assertOk(!harness.deletedCaches.includes('ryu-static-v1'), 'activation should preserve static cache');
  assertOk(!harness.deletedCaches.includes('ryu-images-v1'), 'activation should preserve image cache');

  console.log('Service worker policy guardrail passed.');
}

await main();
