// Offline support. Every file is served from the phone's cache right away,
// and a fresh copy is fetched in the background for next time. So after an
// update is published, the first open shows the old version and the next
// open shows the new one. Bump CACHE only if the file list below changes.

const CACHE = 'monster-v1';

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/garden.js',
  './js/storage.js',
  './js/sprites.js',
  './assets/plants.png',
  './assets/terrarium.png',
  './assets/icons/icon-180.png',
  './assets/icons/icon-192.png',
];

// Google Fonts (the pixel font) is cached the first time it loads.
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

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

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Query strings are ignored so "./?source=home" still finds "./".
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
    if (response) return response;
    if (request.mode === 'navigate') return cache.match('./index.html');
    return Response.error();
  })());
});
