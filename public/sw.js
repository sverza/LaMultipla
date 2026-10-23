const CACHE = 'la-multipla-v9';
const ASSETS = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png', './app-version.json'];
const HOME = new URL('./', self.registration.scope).href;

// Next exports hashed CSS/JS. They must be cached during installation, even
// when the first page loaded them before this worker could intercept requests.
async function precacheInterface() {
  const response = await fetch(new Request(HOME, { cache: 'reload' }));
  if (!response.ok) throw new Error('Offline: pagina iniziale indisponibile');
  const html = await response.clone().text();
  const assets = new Set(ASSETS.slice(1).map(asset => new URL(asset, HOME).href));
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    const url = new URL(match[1].replaceAll('&amp;', '&'), HOME);
    if (url.origin === new URL(HOME).origin && url.pathname.startsWith(new URL('_next/static/', HOME).pathname)) {
      assets.add(url.href);
    }
  }
  const cache = await caches.open(CACHE);
  await cache.addAll([...assets].map(url => new Request(url, { cache: 'reload' })));
  await cache.put(HOME, response);
  await self.skipWaiting();
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheInterface());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => /^la-multipla-v\d+$/.test(key) && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== new URL(HOME).origin || !url.pathname.startsWith(new URL(HOME).pathname)) return;
  const alwaysFresh = url.pathname.endsWith('/latest-slip.json') || url.pathname.endsWith('/app-version.json');
  const network = fetch(event.request);
  if (!alwaysFresh) {
    event.waitUntil(network.then(async response => {
      if (response.ok) await (await caches.open(CACHE)).put(event.request, response.clone());
    }).catch(() => {}));
  }
  event.respondWith(
    network.catch(async () => {
      if (!alwaysFresh) {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(event.request);
        if (cached) return cached;
        // HTML is only a navigation fallback, never a substitute for JS/CSS/JSON.
        if (event.request.mode === 'navigate') {
          const home = await cache.match(HOME);
          if (home) return home;
        }
      }
      return new Response('Risorsa non disponibile offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }),
  );
});
