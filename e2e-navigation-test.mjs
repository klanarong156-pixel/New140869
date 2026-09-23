import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { URL } from 'node:url';

const port = Number(process.env.E2E_PORT || 4173);
const externalBase = process.env.E2E_BASE;
const base = externalBase || `http://127.0.0.1:${port}/`;
const root = new URL(base);
const pages = fs.readdirSync('.').filter(name => name.endsWith('.html') && !name.startsWith('archive')).sort();
const canonicalRoutes = ['dashboard/?page=dashboard', 'dashboard/?page=water', 'dashboard/?page=devices', 'dashboard/?page=connection', 'dashboard/?page=weather', 'dashboard/?page=settings', 'dashboard/?page=info'];
const corePages = ['finance.html', 'account.html'];
const aliasPages = { 'schedule.html': 'dashboard/?page=water', 'connection.html': 'dashboard/?page=connection', 'settings.html': 'dashboard/?page=settings' };
const appRoutes = ['index.html', ...corePages, ...Object.keys(aliasPages)];
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
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`E2E server did not become ready: ${lastError?.message || 'unknown error'}`);
}

async function runChecks() {
  const rootIndex = fs.readFileSync('index.html', 'utf8');
  add('index.html: routes to clean dashboard', /href="dashboard\//.test(rootIndex));
  const cleanDashboard = fs.readFileSync('dashboard/index.html', 'utf8');
  add('dashboard/index.html: has viewport', /name="viewport"/.test(cleanDashboard));
  add('dashboard/index.html: loads clean dashboard CSS', /href="dashboard\.css\?v=\d+"/.test(cleanDashboard));
  add('dashboard/index.html: loads MQTT.js and single connection manager', /mqtt\.min\.js/.test(cleanDashboard) && /dashboard-mqtt\.js/.test(cleanDashboard));
  add('dashboard/index.html: uses canonical internal routes', /\?page=connection/.test(cleanDashboard) && !/href="\.\.\/settings\.html"/.test(cleanDashboard));
  for (const [alias, target] of Object.entries(aliasPages)) {
    const aliasHtml = fs.readFileSync(alias, 'utf8');
    add(`${alias}: redirects to canonical route`, aliasHtml.includes(`url=${target}`) && aliasHtml.includes(`location.replace('${target}')`));
  }
  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    add(`${page}: has viewport`, /name="viewport"/.test(html));
    add(`${page}: has page styling`, page === 'index.html' || aliasPages[page] ? /dashboard\//.test(html) : /href="app\.css\?v=\d+"/.test(html) || /<style[\s>]/.test(html));
    if (corePages.includes(page)) {
      add(`${page}: has bottom navigation`, /class="bottom-nav"/.test(html));
      add(`${page}: has settings link`, /href="settings\.html"/.test(html));
      const navBlock = html.match(/<nav[^>]*class="bottom-nav"[\s\S]*?<\/nav>/)?.[0] || '';
      const navLinks = [...navBlock.matchAll(/<a(?:\s+class="([^"]*)")?\s+href="([^"]+\.html)"/g)];
      const activeLinks = navLinks.filter(([, classes]) => classes?.split(/\s+/).includes('active'));
      add(`${page}: bottom navigation has exactly five existing routes`, navLinks.length === 5 && navLinks.every(([, , href]) => appRoutes.includes(href)));
      add(`${page}: bottom navigation marks exactly one active route`, activeLinks.length === 1 && activeLinks[0][2] === page);
    }
    add(`${page}: uses no active inline color/background override`, aliasPages[page] || !/style="[^\"]*(color|background|opacity|filter)/.test(html));
    const navBlock = html.match(/<nav[^>]*class="bottom-nav"[\s\S]*?<\/nav>/)?.[0] || '';
    for (const href of [...navBlock.matchAll(/href="([^\"]+\.html)"/g)].map(match => match[1])) {
      add(`${page}: nav target ${href} exists`, fs.existsSync(href));
    }
  }

  const css = fs.readFileSync('app.css', 'utf8');
  add('CSS: floating nav is fixed', /\.bottom-nav\s*\{[\s\S]*position:\s*fixed/.test(css));
  add('CSS: dashboard nav override is fixed', /\.dashboard-page \.bottom-nav\s*\{[\s\S]*position:\s*fixed !important/.test(css));
  add('CSS: safe-area is supported', /safe-area-inset-bottom/.test(css));
  add('CSS: light theme dark text exists', /#12384b|#123c50/.test(css));

  for (const page of pages) {
    const url = new URL(page, root);
    const response = await fetch(url);
    add(`${page}: HTTP ${response.status}`, response.ok);
  }
}

try {
  if (!externalBase) {
    server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
      stdio: 'ignore'
    });
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
