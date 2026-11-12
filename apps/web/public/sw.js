// 4Walls service worker: makes the game installable (home-screen app, fullscreen, landscape)
// and loads it fast on repeat visits. The game itself always needs the server (online play),
// so the page shell is network-first; hashed build assets and models are cache-first.
const VERSION = '4walls-v2';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Live data and the game connection never go through the cache.
  if (url.pathname.startsWith('/api') || url.pathname === '/healthz' || url.pathname.startsWith('/matchmake')) return;

  if (req.mode === 'navigate') {
    // Fresh page when online (new deploys show up at once), cached shell when the network fails.
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Hashed build files never change: cache-first. Art, models and icons: serve the cached copy
  // at once and refresh it in the background (stale-while-revalidate).
  const hashed = /^\/assets\/[^/]+-[\w-]{8}\.\w+$/.test(url.pathname);
  if (hashed || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/models/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(
      caches.open(VERSION).then((cache) =>
        cache.match(req).then((hit) => {
          const refresh = () =>
            fetch(req).then((res) => {
              if (res.ok) cache.put(req, res.clone());
              return res;
            });
          if (!hit) return refresh();
          if (!hashed) refresh().catch(() => {});
          return hit;
        }),
      ),
    );
  }
});
