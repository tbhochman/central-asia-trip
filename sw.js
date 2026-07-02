// Offline-first service worker.
// VERSION is stamped by build.js from a hash of the shell files — when the
// shell changes, the cache name changes, the browser sees a byte-different
// sw.js, installs the new worker, and clients auto-reload (see index.html).
// Tiles and ticket files live in separate persistent caches so a shell
// update never wipes offline map areas or decryptable tickets mid-trip.

const VERSION = "ad2f6192852f";
const SHELL_CACHE = "shell-" + VERSION;
const TILES_CACHE = "tiles-v1";
const FILES_CACHE = "files-v1";
const KEEP = new Set([SHELL_CACHE, TILES_CACHE, FILES_CACHE]);

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
      .open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k))),
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
          caches.open(FILES_CACHE).then((c) => c.put(url.pathname, copy));
          return resp;
        })
        .catch(() =>
          caches
            .match(url.pathname)
            .then((r) => r || new Response("{}", { status: 503 })),
        ),
    );
    return;
  }

  // Encrypted tickets: cache-first in the persistent files cache.
  if (url.pathname.includes("/tickets-enc/")) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((resp) => {
            if (resp.ok) {
              const copy = resp.clone();
              caches.open(FILES_CACHE).then((c) => c.put(e.request, copy));
            }
            return resp;
          }),
      ),
    );
    return;
  }

  // Map tiles: cache-as-you-browse, persistent across shell updates.
  if (url.hostname.endsWith("basemaps.cartocdn.com")) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((resp) => {
            const copy = resp.clone();
            caches.open(TILES_CACHE).then((c) => c.put(e.request, copy));
            return resp;
          }),
      ),
    );
    return;
  }

  // Everything else (shell): cache-first with network fallback + backfill.
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(e.request).then((resp) => {
          if (
            resp.ok &&
            (url.origin === location.origin || url.hostname === "unpkg.com")
          ) {
            const copy = resp.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(e.request, copy));
          }
          return resp;
        }),
    ),
  );
});
