import fs from 'node:fs';

const html = fs.readFileSync('dashboard/index.html', 'utf8');
const js = fs.readFileSync('dashboard/dashboard.js', 'utf8');
const css = fs.readFileSync('dashboard/dashboard.css', 'utf8');
const checks = [];
const add = (name, ok) => checks.push({ name, ok });

const routeSections = [...html.matchAll(/data-page-section="([^"]+)"/g)].map(match => match[1]);
const nav = html.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/)?.[0] || '';
const relays = [...html.matchAll(/data-relay-card="([^"]+)"/g)].map(match => match[1]);
const expectedRoutes = ['dashboard', 'water', 'devices', 'connection', 'weather', 'settings', 'info'];
const expectedRelays = ['pump', 'zone1', 'lighthome', 'lightsala'];

add('Dashboard shell has viewport-safe entrypoint', /name="viewport"[^>]+viewport-fit=cover/.test(html));
add('Current route sections are complete', expectedRoutes.every(route => routeSections.includes(route)) && routeSections.length === expectedRoutes.length);
add('Route metadata matches current sections', expectedRoutes.every(route => new RegExp(`\\b${route}:\\s*\\[`).test(js)));
add('Unknown query falls back to dashboard', /hasOwnProperty\.call\(pageMeta, requested\) \? requested : 'dashboard'/.test(js));
add('Mobile navigation exposes all current routes', nav && (nav.match(/<a /g) || []).length === 8 && expectedRoutes.every(route => nav.includes(`data-route="${route}"`)));
add('All protected relay IDs remain intact', expectedRelays.every(id => relays.includes(id)));
add('Each relay card keeps explicit on/off control hooks', expectedRelays.every(id => new RegExp(`data-relay-card="${id}"[\\s\\S]*data-relay-on[\\s\\S]*data-relay-off`).test(html)));
add('Dashboard keeps the real-device sensor truth', /Soil Sensor[\s\S]*ไม่ได้ติดตั้ง/.test(html) && /data-temperature/.test(html) && /data-humidity/.test(html));
add('Weather surface is separate from DHT11 bindings', /data-weather-current/.test(html) && /data-weather-status/.test(html) && /data-temperature/.test(html));
add('Connection page keeps credential form and diagnostics', /data-credential-form/.test(html) && /data-diagnostic-error/.test(html));
add('Dashboard uses canonical MQTT manager only', /dashboard-mqtt\.js/.test(html) && !/mqtt-connection\.js|mqtt-handler\.js/.test(html));
add('Dashboard registers scoped service worker', /navigator\.serviceWorker\.register\(swUrl, \{ scope: swScope \}\)/.test(html));
add('Mobile CSS has safe-area and overflow-aware nav', /safe-area-inset-bottom/.test(css) && /\.bottom-nav/.test(css));
add('Small viewport keeps control cards usable', /@media\(max-width:390px\)[\s\S]*grid-template-columns:repeat\(2/.test(css));
add('Dashboard JS binds relay, mode, and route behavior', /data-relay-on/.test(js) && /data-relay-off/.test(js) && /data-mode/.test(js) && /const route/.test(js));

let failed = 0;
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`);
  if (!check.ok) failed += 1;
}
console.log(`Dashboard layout audit: ${checks.length - failed} passed, ${failed} failed`);
if (failed) process.exit(1);
