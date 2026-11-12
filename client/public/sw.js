// GoFoode service worker: makes the site installable, opens instantly on repeat visits and shows a
// friendly page when offline. API calls are never cached, so prices, orders and payments are always live.
const VERSION = "gofoode-v1";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const IMAGES = `${VERSION}-images`;
const PRECACHE = ["/", "/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/food-placeholder.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => !key.startsWith(VERSION)).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map(key => cache.delete(key)));
}

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io"))) return;

  // Pages: always try the network for the freshest app, fall back to the cached shell, then the offline page.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(SHELL).then(cache => cache.put("/", copy));
      return response;
    }).catch(async () => (await caches.match("/")) || caches.match("/offline.html")));
    return;
  }

  // Hashed build assets never change: cache-first.
  if (sameOrigin && url.pathname.startsWith("/assets/")) {
    event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(RUNTIME).then(cache => cache.put(request, copy)); }
      return response;
    })));
    return;
  }

  // Food photos and other images: serve from cache, refresh in the background, keep the cache small.
  if (request.destination === "image") {
    event.respondWith(caches.open(IMAGES).then(async cache => {
      const hit = await cache.match(request);
      const network = fetch(request).then(response => {
        if (response.ok || response.type === "opaque") { cache.put(request, response.clone()); trim(IMAGES, 80); }
        return response;
      }).catch(() => hit);
      return hit || network;
    }));
  }
});
