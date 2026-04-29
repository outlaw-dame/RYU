const STATIC_CACHE = "ryu-static-v1";
const IMAGE_CACHE = "ryu-images-v1";
const MAX_IMAGE_ENTRIES = 350;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([STATIC_CACHE, IMAGE_CACHE]);
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => (keep.has(key) ? Promise.resolve() : caches.delete(key))));
    await self.clients.claim();
  })());
});

function isHashedStaticAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/assets/");
}

function isImageLikeRequest(request, url) {
  if (request.destination === "image") return true;
  const path = url.pathname.toLowerCase();
  return path.endsWith(".jpg") || path.endsWith(".jpeg") || path.endsWith(".png") || path.endsWith(".webp") || path.endsWith(".gif") || path.endsWith(".avif") || path.endsWith(".svg");
}

function shouldBypassSensitiveApi(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/api/auth/");
}

async function trimImageCache() {
  const cache = await caches.open(IMAGE_CACHE);
  const keys = await cache.keys();
  if (keys.length <= MAX_IMAGE_ENTRIES) {
    return;
  }

  const evictCount = keys.length - MAX_IMAGE_ENTRIES;
  await Promise.all(keys.slice(0, evictCount).map((request) => cache.delete(request)));
}

async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        await cache.put(request, response.clone());
        if (cacheName === IMAGE_CACHE) {
          await trimImageCache();
        }
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const network = await networkPromise;
  if (network) {
    return network;
  }

  return new Response("", { status: 504, statusText: "Gateway Timeout" });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (shouldBypassSensitiveApi(url)) {
    return;
  }

  if (isHashedStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(STATIC_CACHE, request));
    return;
  }

  if (isImageLikeRequest(request, url)) {
    event.respondWith(staleWhileRevalidate(IMAGE_CACHE, request));
  }
});
