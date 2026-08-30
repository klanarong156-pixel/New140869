import fs from 'node:fs';
import { URL } from 'node:url';

const base = process.env.E2E_BASE || 'http://127.0.0.1:4173/';
const root = new URL(base);
const pages = fs.readdirSync('.').filter(name => name.endsWith('.html') && !name.startsWith('archive')).sort();
const corePages = ['index.html', 'schedule.html', 'finance.html', 'account.html', 'settings.html'];
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok, detail });

for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8');
  add(`${page}: has viewport`, /name="viewport"/.test(html));
  add(`${page}: has page styling`, /href="app\.css\?v=\d+"/.test(html) || /<style[\s>]/.test(html));
  if (corePages.includes(page)) {
    add(`${page}: has bottom navigation`, /class="bottom-nav"/.test(html));
    add(`${page}: has settings link`, /href="settings\.html"/.test(html));
  }
  add(`${page}: uses no active inline color/background override`, !/style="[^\"]*(color|background|opacity|filter)/.test(html));
  const navBlock = html.match(/<nav[^>]*class="bottom-nav"[\s\S]*?<\/nav>/)?.[0] || '';
  for (const href of [...navBlock.matchAll(/href="([^"]+\.html)"/g)].map(m => m[1])) {
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

let failed = 0;
for (const check of checks) {
  if (check.ok) console.log(`PASS ${check.name}`);
  else { failed++; console.log(`FAIL ${check.name}${check.detail ? ` — ${check.detail}` : ''}`); }
}
console.log(`E2E navigation checks: ${checks.length - failed} passed, ${failed} failed`);
if (failed) process.exit(1);
