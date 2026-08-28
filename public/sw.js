const CACHE = 'la-multipla-v8';
const ASSETS = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png', './app-version.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const alwaysFresh = url.pathname.endsWith('/latest-slip.json') || url.pathname.endsWith('/app-version.json');
  event.respondWith(
    fetch(event.request).then((response) => {
      if (!alwaysFresh) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => caches.match(event.request).then((response) => response || caches.match('./'))),
  );
});
