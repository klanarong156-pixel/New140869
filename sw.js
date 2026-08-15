const CACHE_NAME = 'smartfarm-v7-app-1';
const APP_SHELL = [
  './', './index.html', './404.html', './auth.html', './schedule.html', './finance.html', './account.html', './settings.html', './admin.html', './ota.html',
  './manifest.json', './app.css', './app.js', './dashboard-ota.js', './config.js', './mqtt-handler.js', './weather.js', './auto-weather-guard.js', './schedule.js', './firebase.js', './access.js', './auth-page.js', './finance-core.js', './finance-firebase.js', './finance.js', './account.js', './admin.js',
  './logo.png', './icon-192.png', './icon-512.png', './apple-touch-icon.png'
];
const MEDIA_EXT = /\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf)$/i;

self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('smartfarm-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => caches.match('./index.html')));
    return;
  }
  if (/\.(?:js|css|html|json)$/i.test(url.pathname)) {
    event.respondWith(fetch(request, { cache: 'no-store' }).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
      return response;
    }).catch(() => caches.match(request)));
    return;
  }
  if (MEDIA_EXT.test(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
      return response;
    })));
  }
});
