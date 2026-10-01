import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright-core';

const port = Number(process.env.WEATHER_TEST_PORT || 4187);
const base = process.env.DASHBOARD_BASE || `http://127.0.0.1:${port}/dashboard/?page=weather`;
const remote = Boolean(process.env.DASHBOARD_BASE);
const server = remote ? null : spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
let requestCount = 0;
try {
  if (!remote) {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try { const response = await fetch(base); if (response.ok) { ready = true; break; } } catch (_) {}
      await wait(100);
    }
    if (!ready) throw new Error('local dashboard server did not become ready');
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('https://api.open-meteo.com/v1/forecast**', async route => {
    requestCount += 1;
    if (requestCount === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'test unavailable' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      current: { temperature_2m: 29.4, weather_code: 3, rain: 0.2, relative_humidity_2m: 74, wind_speed_10m: 8.1, wind_direction_10m: 270 },
      daily: { time: ['2026-10-02', '2026-10-03', '2026-10-04'], weather_code: [3, 61, 1], temperature_2m_max: [32, 31, 33], temperature_2m_min: [24, 23, 24], precipitation_probability_max: [20, 70, 10] }
    }) });
  });
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const retry = page.locator('[data-weather-retry]');
  await retry.waitFor({ state: 'visible', timeout: 10000 });
  if (await page.locator('[data-weather-status]').first().textContent() !== 'ไม่สามารถเชื่อมต่อข้อมูลสภาพอากาศได้') throw new Error('Weather failure state message is incorrect');
  if (await page.locator('[data-forecast]').first().locator('li').count() !== 0) throw new Error('stale forecast remained visible after API failure');
  if (await page.locator('[data-weather-current]').first().textContent() !== 'ยังไม่มีข้อมูล') throw new Error('stale current weather remained visible after API failure');
  await retry.click();
  await page.waitForFunction(() => document.querySelector('[data-weather-retry]')?.hidden === true, null, { timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('[data-weather-current]')?.textContent.includes('29.4'), null, { timeout: 10000 });
  if (requestCount !== 2) throw new Error(`Retry did not perform exactly one new API request (count=${requestCount})`);
  if (await page.locator('[data-forecast]').first().locator('li').count() !== 3) throw new Error('three-day forecast did not render');
  const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  if (layout.width > layout.viewport) throw new Error(`mobile horizontal overflow: ${JSON.stringify(layout)}`);
  if (pageErrors.length) throw new Error(`uncaught browser errors: ${pageErrors.join(' | ')}`);
  console.log('PASS Weather API failure clears stale values and exposes Retry');
  console.log('PASS Retry performs a new API request and renders current conditions plus 3-day forecast');
} finally {
  if (browser) await browser.close();
  if (server) { server.kill('SIGTERM'); await once(server, 'exit').catch(() => {}); }
}
