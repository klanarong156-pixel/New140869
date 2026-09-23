const CACHE_NAME = 'smartfarm-v14-lwt-status-1';
const APP_SHELL = [
  './', './index.html', './dashboard/', './dashboard/index.html',
  './dashboard/dashboard.css?v=4', './dashboard/dashboard-config.js?v=1',
  './dashboard/dashboard-state.js?v=1', './dashboard/dashboard-mqtt.js?v=1',
  './dashboard/dashboard.js?v=4', './mqtt.min.js?v=5', './404.html',
  './connection.html', './schedule.html', './settings.html', './dashboard-connection.css',
  './auth.html', './schedule.html', './finance.html', './account.html', './settings.html', './admin.html', './ota.html',
  './manifest.json', './app.css', './redesign-lambo.css', './pump-hero.css', './suanlungna-design-system.css', './dashboard-polish.css', './dashboard-realtime.css', './app.js', './dashboard-ota.js', './config.js', './mqtt-connection.js', './internet-time.js', './weather.js', './auto-weather-guard.js', './schedule.js', './firebase.js', './access.js', './auth-page.js', './finance-core.js', './finance-firebase.js', './finance.js', './account.js', './crop-reminders.js', './crop-plots.js', './farm-analytics.js', './ai-farm-advisor.js', './farm-tools.js', './farm-clock.js', './user-management.js', './MQTT_CONTRACT_V6.html', './HARDWARE_V6.html',
  './logo.png', './assets/logo-suanlungna-transparent.png', './assets/farm-background.jpg', './assets/cucumber-plot.jpg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'
];
const MEDIA_EXT = /\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf)$/i;

self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
));

self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('smartfarm-') && key !== CACHE_NAME).map(key => caches.delete(key))
  )).then(() => self.clients.claim())
));

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('./dashboard/index.html')))
    );
    return;
  }

  if (/\.(?:js|css|html|json)$/i.test(url.pathname)) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
        return response;
      }).catch(() => caches.match(request))
    );
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
