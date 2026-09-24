import { chromium } from 'playwright-core';

const base = process.env.AUDIT_BASE || 'http://127.0.0.1:4173/';
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const viewports = [320, 375, 390, 414, 768, 1280].map(width => ({ width, height: width <= 414 ? 844 : width === 768 ? 1024 : 900 }));
const routes = [
  { name: 'index', path: 'index.html', protected: false, expected: 'dashboard' },
  { name: 'auth', path: 'auth.html', protected: false, expected: 'authForm' },
  { name: 'dashboard', path: 'dashboard/?page=dashboard', protected: false, expected: 'dashboard' },
  { name: 'water', path: 'dashboard/?page=water', protected: false, expected: 'water' },
  { name: 'devices', path: 'dashboard/?page=devices', protected: false, expected: 'devices' },
  { name: 'connection', path: 'dashboard/?page=connection', protected: false, expected: 'connection' },
  { name: 'weather', path: 'dashboard/?page=weather', protected: false, expected: 'weather' },
  { name: 'settings', path: 'dashboard/?page=settings', protected: false, expected: 'settings' },
  { name: 'info', path: 'dashboard/?page=info', protected: false, expected: 'info' },
  { name: 'finance', path: 'finance.html', protected: true, expected: 'cucumberSalesForm' },
  { name: 'account', path: 'account.html', protected: true, expected: 'profileForm' },
  { name: 'admin', path: 'admin.html', protected: true, expected: 'user-management' },
  { name: 'ota', path: 'ota.html', protected: true, expected: 'otaDashboardForm' },
  { name: '404', path: '404.html', protected: false, expected: '404' }
];

const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = [];

for (const viewport of viewports) {
  for (const route of routes) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`));
    await page.route('https://api.open-meteo.com/**', routeInfo => routeInfo.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ current: { temperature_2m: 28.4, weather_code: 1, rain: 0 }, daily: { time: ['2026-09-24', '2026-09-25', '2026-09-26'], weather_code: [1, 2, 3], temperature_2m_max: [32, 33, 31], temperature_2m_min: [24, 24, 23] } }) }));
    await page.route('https://smart-farm-platfor-default-rtdb.asia-southeast1.firebasedatabase.app/**', routeInfo => {
      const url = routeInfo.request().url();
      const body = url.includes('/roles/audit-user') ? JSON.stringify({ role: 'admin' }) : 'null';
      return routeInfo.fulfill({ status: 200, contentType: 'application/json', body });
    });
    await page.route('https://us-central1-smart-farm-platfor.cloudfunctions.net/**', routeInfo => routeInfo.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [] }) }));
    await page.route('https://cdnjs.cloudflare.com/**', routeInfo => routeInfo.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.jspdf = window.jspdf || {}; window.jspdf.jsPDF = function () {};' }));
    if (route.protected) {
      await page.addInitScript(() => {
        localStorage.setItem('smartfarm.firebase.idToken', 'audit-token');
        localStorage.setItem('smartfarm.firebase.user', JSON.stringify({ localId: 'audit-user', email: 'audit@example.com' }));
      });
    }
    const response = await page.goto(new URL(route.path, base).toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(450);
    const data = await page.evaluate(({ routeName, expected }) => {
      const selector = expected === 'authForm' ? '#authForm' : expected === 'cucumberSalesForm' ? '#cucumberSalesForm' : expected === 'profileForm' ? '#profileForm' : expected === 'user-management' ? '#user-management' : expected === 'otaDashboardForm' ? '#otaDashboardForm' : expected === '404' ? '.empty-state' : `[data-page-section="${expected}"]`;
      const expectedElement = document.querySelector(selector);
      const visible = expectedElement ? !expectedElement.hidden && getComputedStyle(expectedElement).display !== 'none' : false;
      return {
        routeName,
        title: document.title,
        expectedVisible: visible,
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        navLinks: document.querySelectorAll('.bottom-nav a').length,
        buttons: [...document.querySelectorAll('button')].filter(button => getComputedStyle(button).display !== 'none').length
      };
    }, { routeName: route.name, expected: route.expected });
    const noOverflow = data.scrollWidth <= data.viewportWidth;
    const passed = Boolean(response?.ok()) && data.expectedVisible && noOverflow && consoleErrors.length === 0 && pageErrors.length === 0;
    results.push({ viewport: viewport.width, route: route.name, httpStatus: response?.status() || 0, ...data, noOverflow, consoleErrors, pageErrors, failedRequests, passed });
    if (route.name === 'dashboard' && (viewport.width === 390 || viewport.width === 1280)) await page.screenshot({ path: `/tmp/smartfarm-${route.name}-${viewport.width}.png`, fullPage: true });
    await context.close();
  }
}

const failed = results.filter(result => !result.passed);
const summary = {
  viewports: viewports.length,
  routes: routes.length,
  combinations: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  consoleErrors: results.reduce((sum, result) => sum + result.consoleErrors.length + result.pageErrors.length, 0),
  failedRequests: results.reduce((sum, result) => sum + result.failedRequests.length, 0),
  failures: failed
};
console.log(JSON.stringify(summary, null, 2));
await browser.close();
if (failed.length) process.exit(1);
