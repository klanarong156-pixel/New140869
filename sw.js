const CACHE_NAME = 'agri-ledger-v1';
const APP_SHELL = [
  './', './index.html', './auth.html', './manifest.json', './accounting.css?v=1',
  './firebase.js?v=12', './auth-page.js?v=9', './accounting-core.js?v=1',
  './accounting-store.js?v=1', './accounting.js?v=1', './icon-192.png', './icon-512.png', './apple-touch-icon.png'
];

self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE_NAME)
    .then(cache => Promise.all(APP_SHELL.map(asset => cache.add(asset).catch(() => null))))
    .then(() => self.skipWaiting())
));

self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('smartfarm-') || key.startsWith('agri-ledger-') && key !== CACHE_NAME).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-store' })
      .then(response => {
        if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone())).catch(() => {});
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match('./index.html'))));
    return;
  }

  if (/\.(?:js|css|html|json|png|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(fetch(request, { cache: 'no-store' })
      .then(response => {
        if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone())).catch(() => {});
        return response;
      })
      .catch(() => caches.match(request)));
  }
});
