// Offline support.
//
// Two strategies, split by what the file is:
//
//   The app shell (the page, its CSS and its JS) is network-first. A push
//   then lands on the next open with a signal, instead of taking two reloads
//   to appear. Falling back to the cache keeps the app working offline.
//
//   Everything else, which in practice means the art, is cache-first with a
//   background refresh. It is big, it rarely changes, and waiting on the
//   network for it would make the app feel slow every morning.
//
// Serving fresh HTML from a stale cache of JS would mean a new page running
// old code, so the shell moves as one piece.
//
// Bump CACHE whenever the file list below changes.

const CACHE = 'monster-v3';

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/monster.js',
  './js/storage.js',
  './js/art.js',
  './assets/room.png',
  './assets/embertail.png',
  './assets/voltectra.png',
  './assets/bubbletide.png',
  './assets/icons/icon-180.png',
  './assets/icons/icon-192.png',
];

// Google Fonts (the pixel font) is cached the first time it loads.
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// The page, its stylesheet and its scripts. `destination` is empty for a few
// older browsers, so navigations are checked separately.
function isAppShell(request) {
  return request.mode === 'navigate' || ['document', 'script', 'style'].includes(request.destination);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !FONT_HOSTS.includes(url.hostname)) return;

  if (sameOrigin && isAppShell(request)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      } catch {
        // Offline, or the network failed. Fall back to the last good copy.
        // Query strings are ignored so "./?source=home" still finds "./".
        const cached = await cache.match(request, { ignoreSearch: sameOrigin });
        if (cached) return cached;
        if (request.mode === 'navigate') return cache.match('./index.html');
        return Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: sameOrigin });
    const fresh = fetch(request)
      .then((response) => {
        if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
        return response;
      })
      .catch(() => null);
    if (cached) {
      event.waitUntil(fresh);
      return cached;
    }
    const response = await fresh;
    return response ?? Response.error();
  })());
});
