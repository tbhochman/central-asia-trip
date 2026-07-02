// Offline-first service worker. App shell is precached; data.enc.json is
// network-first with cache fallback so trip-data updates land when online
// but the wallet still opens in airplane mode on the Pamir Highway.

const CACHE = "central-asia-v1";

const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Encrypted data: network-first (fresh bookings), cache fallback (offline).
  // Ignore the ?t= cache-buster when matching.
  if (url.pathname.endsWith("/data.enc.json")) {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(url.pathname, copy));
          return resp;
        })
        .catch(() =>
          caches.match(url.pathname).then(
            (r) => r || new Response("{}", { status: 503 }),
          ),
        ),
    );
    return;
  }

  // Map tiles: cache-as-you-browse so previously viewed areas work offline.
  if (url.hostname.endsWith("basemaps.cartocdn.com")) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((resp) => {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
            return resp;
          }),
      ),
    );
    return;
  }

  // Everything else: cache-first with network fallback + backfill.
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(e.request).then((resp) => {
          if (resp.ok && (url.origin === location.origin || url.hostname === "unpkg.com")) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return resp;
        }),
    ),
  );
});
