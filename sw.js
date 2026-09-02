const CACHE_NAME = 'smartfarm-v7.1-field-stability-7';

// Keep only the entry pages here. Their local src/href references—and any
// references found in local CSS—are discovered automatically during install.
const APP_PAGES = [
  './', './index.html', './404.html', './auth.html', './schedule.html',
  './finance.html', './account.html', './settings.html', './admin.html',
  './ota.html', './firebase-setup.html', './ota-standalone.html',
  './realtime-mqtt.html', './MQTT_CONTRACT_V6.html', './HARDWARE_V6.html',
  './sw.js'
];

const MEDIA_EXT = /\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf)$/i;
const LOCAL_DOCUMENT_EXT = /\.(?:html?|css|js|json|md|txt|mjs|ino)$/i;
const REF_ATTR = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
const CSS_URL = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
const CSS_IMPORT = /@import\s+["']([^"']+)["']/gi;

function toLocalUrl(reference, baseUrl) {
  const value = String(reference || '').trim();
  if (!value || value.startsWith('#') || /^(?:data:|blob:|javascript:|mailto:|tel:|https?:)/i.test(value)) return null;
  try {
    const url = new URL(value, baseUrl);
    if (url.origin !== self.location.origin) return null;
    url.hash = '';
    return url.href;
  } catch (_) {
    return null;
  }
}

function isDiscoverable(url, contentType = '') {
  return /text\/html|text\/css|javascript|json/i.test(contentType) || LOCAL_DOCUMENT_EXT.test(new URL(url).pathname);
}

function extractLocalReferences(text, baseUrl, contentType = '') {
  const references = new Set();
  const addMatches = regex => {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const url = toLocalUrl(match[1], baseUrl);
      if (url) references.add(url);
    }
  };

  if (/text\/html/i.test(contentType) || /\.html?$/i.test(new URL(baseUrl).pathname)) addMatches(REF_ATTR);
  if (/text\/css/i.test(contentType) || /\.css$/i.test(new URL(baseUrl).pathname)) {
    addMatches(CSS_URL);
    addMatches(CSS_IMPORT);
  }
  return references;
}

async function fetchForDiscovery(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return { text: await response.text(), contentType: response.headers.get('content-type') || '' };
  } catch (_) {
    return null;
  }
}

async function discoverAppShell() {
  const shell = new Set(APP_PAGES.map(page => new URL(page, self.location.href).href));
  const queue = [...shell];
  const visited = new Set();

  while (queue.length) {
    const pageUrl = queue.shift();
    if (visited.has(pageUrl)) continue;
    visited.add(pageUrl);
    const source = await fetchForDiscovery(pageUrl);
    if (!source || !isDiscoverable(pageUrl, source.contentType)) continue;

    for (const reference of extractLocalReferences(source.text, pageUrl, source.contentType)) {
      if (!shell.has(reference)) {
        shell.add(reference);
        if (isDiscoverable(reference)) queue.push(reference);
      }
    }
  }
  return [...shell];
}

async function installCache() {
  const cache = await caches.open(CACHE_NAME);
  const shell = await discoverAppShell();
  const results = await Promise.allSettled(shell.map(url => cache.add(url)));
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length) console.warn(`Smart Farm: ${failures.length} asset(s) were not cached during install`);
  await self.skipWaiting();
}

self.addEventListener('install', event => event.waitUntil(installCache()));

self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(
      keys.filter(key => key.startsWith('smartfarm-') && key !== CACHE_NAME).map(key => caches.delete(key))
    ))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  if (LOCAL_DOCUMENT_EXT.test(url.pathname)) {
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
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
        return response;
      }))
    );
  }
});
