// Offline cache for the app shell. Card data never passes through here:
// it lives in localStorage and the app makes no network requests for it.
const VERSION = 'cv-1.0.0';
const SHELL = [
  './', './index.html', './privacy.html', './manifest.webmanifest', './css/app.css', './css/privacy.css',
  './js/app.js', './js/views.js', './js/ui.js', './js/pinpad.js', './js/icons.js',
  './js/cards.js', './js/crypto.js', './js/store.js', './js/passkey.js', './js/data.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (req.mode === 'navigate') {
      return (await cache.match('./index.html')) || fetch(req);
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    return hit || fetch(req);
  })());
});
