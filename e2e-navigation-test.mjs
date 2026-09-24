import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { URL } from 'node:url';

const port = Number(process.env.E2E_PORT || 4173);
const externalBase = process.env.E2E_BASE;
const base = externalBase || `http://127.0.0.1:${port}/`;
const root = new URL(base);
const livePages = ['index.html', 'auth.html', 'dashboard/index.html', 'finance.html', 'account.html', 'admin.html', 'ota.html', '404.html'];
const dashboardRoutes = ['dashboard/', 'dashboard/?page=dashboard', 'dashboard/?page=water', 'dashboard/?page=devices', 'dashboard/?page=connection', 'dashboard/?page=weather', 'dashboard/?page=settings', 'dashboard/?page=info', 'dashboard/?page=unknown'];
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok, detail });
let server;

async function waitForServer(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`E2E server did not become ready: ${lastError?.message || 'unknown error'}`);
}

function pagePath(page) {
  return page === 'dashboard/' ? 'dashboard/index.html' : page;
}

async function runChecks() {
  const rootIndex = fs.readFileSync('index.html', 'utf8');
  add('index.html: routes to clean dashboard', /href="dashboard\//.test(rootIndex));
  const dashboard = fs.readFileSync('dashboard/index.html', 'utf8');
  add('dashboard/index.html: has viewport', /name="viewport"[^>]+viewport-fit=cover/.test(dashboard));
  add('dashboard/index.html: loads clean dashboard CSS', /href="dashboard\.css\?v=\d+"/.test(dashboard));
  add('dashboard/index.html: loads one canonical MQTT manager', /mqtt\.min\.js/.test(dashboard) && /dashboard-mqtt\.js/.test(dashboard) && !/mqtt-connection\.js|mqtt-handler\.js/.test(dashboard));
  add('dashboard/index.html: declares current route links', ['dashboard', 'water', 'devices', 'connection', 'weather', 'settings', 'info'].every(route => dashboard.includes(`data-route="${route}"`)));
  add('dashboard/index.html: retains four relay IDs', ['pump', 'zone1', 'lighthome', 'lightsala'].every(id => dashboard.includes(`data-relay-card="${id}"`)));

  const allNavHrefs = new Set();
  for (const page of livePages) {
    const html = fs.readFileSync(page, 'utf8');
    add(`${page}: has viewport`, /name="viewport"/.test(html));
    add(`${page}: has title`, /<title>[^<]+<\/title>/.test(html));
    add(`${page}: has page styling`, page === 'index.html' ? /dashboard\//.test(html) : /\.css/.test(html));
    const navBlocks = [...html.matchAll(/<nav[^>]*class="bottom-nav"[\s\S]*?<\/nav>/g)].map(match => match[0]);
    if (['finance.html', 'account.html', 'admin.html', 'ota.html'].includes(page)) add(`${page}: has consistent bottom navigation`, navBlocks.length === 1 && (navBlocks[0].match(/<a /g) || []).length === 8);
    for (const navBlock of navBlocks) {
      for (const href of [...navBlock.matchAll(/href="([^"]+)"/g)].map(match => match[1])) {
        allNavHrefs.add(href);
        const path = href.split('?')[0];
        add(`${page}: nav target ${href} exists`, href.startsWith('?') || path.startsWith('dashboard/') || fs.existsSync(path) || (page === 'dashboard/index.html' && path === '../finance.html'));
      }
    }
  }
  add('Navigation inventory has multiple live targets', allNavHrefs.size >= 8);
  add('Protected pages preserve auth gates', ['finance.html', 'account.html', 'admin.html', 'ota.html'].every(page => /data-auth-required="true"/.test(fs.readFileSync(page, 'utf8'))));
  add('Admin and OTA preserve admin gates', /data-admin-required="true"/.test(fs.readFileSync('admin.html', 'utf8')) && /data-admin-required="true"/.test(fs.readFileSync('ota.html', 'utf8')));
  add('Firebase deployment selects firebase.rules.json', /"rules":\s*"firebase\.rules\.json"/.test(fs.readFileSync('firebase.json', 'utf8')));
  add('Cucumber rules mirror the deployed rules', fs.readFileSync('firebase.rules.json', 'utf8') === fs.readFileSync('database.rules.json', 'utf8'));

  for (const page of [...livePages, ...dashboardRoutes]) {
    const url = new URL(pagePath(page), root);
    const response = await fetch(url);
    add(`${page}: HTTP ${response.status}`, response.ok);
  }
}

try {
  if (!externalBase) {
    server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
    server.once('error', error => { throw error; });
    await waitForServer(base);
    console.log(`E2E server ready at ${base}`);
  }
  await runChecks();
  let failed = 0;
  for (const check of checks) {
    if (check.ok) console.log(`PASS ${check.name}`);
    else { failed++; console.log(`FAIL ${check.name}${check.detail ? ` — ${check.detail}` : ''}`); }
  }
  console.log(`E2E navigation checks: ${checks.length - failed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
} finally {
  if (server && !server.killed) server.kill('SIGTERM');
}
