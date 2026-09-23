import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright-core';

const port = Number(process.env.DASHBOARD_BROWSER_PORT || 4174);
const base = process.env.DASHBOARD_BASE || `http://127.0.0.1:${port}/dashboard/`;
const remote = Boolean(process.env.DASHBOARD_BASE);
const server = remote ? null : spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  if (!remote) {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const response = await fetch(base);
        if (response.ok) { ready = true; break; }
      } catch (_) {}
      await wait(100);
    }
    if (!ready) throw new Error('local server did not become ready');
  }

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  const pageErrors = [];
  const requests = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => requests.push(new URL(request.url()).pathname));

  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('[data-mqtt-status]');
  await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then(Boolean), null, { timeout: 5000 }).catch(() => {});
  await wait(250);

  const result = await page.evaluate(async () => ({
    title: document.title,
    mqttStatus: document.querySelector('[data-mqtt-status]')?.textContent,
    espStatus: document.querySelector('[data-esp-status]')?.textContent,
    mqttLoaded: typeof window.mqtt !== 'undefined',
    managerLoaded: Boolean(window.SmartFarmDashboardMqtt),
    stateLoaded: Boolean(window.SmartFarmDashboardState),
    serviceWorker: Boolean(await navigator.serviceWorker.getRegistration()) || [...document.scripts].some(script => script.textContent.includes('navigator.serviceWorker.register')),
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth
  }));

  const check = (condition, message) => {
    if (!condition) throw new Error(`FAIL: ${message}`);
    console.log(`PASS: ${message}`);
  };
  check(result.title.includes('สวนลุงนะ'), 'dashboard title renders');
  check(result.mqttLoaded, 'MQTT.js loads in browser');
  check(result.managerLoaded && result.stateLoaded, 'clean MQTT manager and state load');
  check(result.mqttStatus.includes('ออฟไลน์'), 'MQTT starts offline without embedded password');
  check(result.espStatus.includes('ออฟไลน์'), 'ESP starts offline without heartbeat');
  check(result.serviceWorker, 'dashboard includes service worker registration path');
  check(result.bodyWidth <= result.viewportWidth, 'mobile layout fits viewport without horizontal overflow');
  check(!requests.some(path => path.endsWith('/mqtt-connection.js') || path.endsWith('/mqtt-handler.js')), 'old dashboard MQTT connection files are not loaded');
  check(consoleErrors.length === 0, `browser console has no errors${consoleErrors.length ? `: ${consoleErrors.join(' | ')}` : ''}`);
  check(pageErrors.length === 0, `page has no uncaught errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);

  await browser.close();
  console.log('\nClean dashboard browser smoke test passed.');
} finally {
  if (server) {
    server.kill('SIGTERM');
    await once(server, 'exit').catch(() => {});
  }
}
