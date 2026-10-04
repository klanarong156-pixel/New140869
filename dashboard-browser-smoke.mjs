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
  await page.route('https://api.open-meteo.com/v1/forecast**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      current: { temperature_2m: 26.9, weather_code: 3, rain: 0, relative_humidity_2m: 92, wind_speed_10m: 4.1, wind_direction_10m: 299 },
      daily: { time: ['2026-10-04', '2026-10-05', '2026-10-06'], weather_code: [61, 3, 2], temperature_2m_max: [32, 31, 30], temperature_2m_min: [25, 24, 23], precipitation_probability_max: [90, 100, 80] }
    })
  }));

  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('[data-mqtt-status]', { state: 'attached' });
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
  check(/ออฟไลน์|ยังไม่มีข้อมูล/.test(result.mqttStatus || ''), 'MQTT starts offline/unknown without embedded password');
  check(/ออฟไลน์|ยังไม่มีข้อมูล/.test(result.espStatus || ''), 'ESP starts offline/unknown without heartbeat');
  check(result.serviceWorker, 'dashboard includes service worker registration path');
  check(result.bodyWidth <= result.viewportWidth, 'mobile layout fits viewport without horizontal overflow');
  check(!requests.some(path => path.endsWith('/mqtt-connection.js') || path.endsWith('/mqtt-handler.js')), 'old dashboard MQTT connection files are not loaded');

  await page.locator('.bottom-nav [data-shared-route="weather"]').click();
  await page.waitForFunction(() => {
    const section = document.querySelector('[data-page-section="weather"]');
    return section && !section.hidden;
  });
  const weatherReadability = await page.evaluate(() => {
    const section = document.querySelector('[data-page-section="weather"]');
    const current = section.querySelector('.weather-main > div > strong');
    const forecast = section.querySelector('.forecast-list');
    const probe = document.createElement('li');
    probe.innerHTML = '<strong>32° / 25°</strong>';
    forecast.append(probe);
    const currentStyle = getComputedStyle(current);
    const forecastStyle = getComputedStyle(probe.querySelector('strong'));
    const factsStyle = getComputedStyle(section.querySelector('.weather-facts b'));
    const result = {
      currentColor: currentStyle.color,
      currentSize: parseFloat(currentStyle.fontSize),
      currentWeight: parseInt(currentStyle.fontWeight, 10),
      forecastColor: forecastStyle.color,
      forecastSize: parseFloat(forecastStyle.fontSize),
      forecastWeight: parseInt(forecastStyle.fontWeight, 10),
      factsColor: factsStyle.color,
      factsSize: parseFloat(factsStyle.fontSize),
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth
    };
    probe.remove();
    return result;
  });
  await page.screenshot({ path: '/tmp/weather-mobile-390.png', fullPage: true });
  check(weatherReadability.currentColor === 'rgb(18, 56, 45)' && weatherReadability.currentSize >= 44 && weatherReadability.currentWeight >= 900, 'current weather temperature is dark, bold, and prominent on mobile');
  check(weatherReadability.forecastColor === 'rgb(18, 56, 45)' && weatherReadability.forecastSize >= 20 && weatherReadability.forecastWeight >= 900, 'forecast temperatures are dark, bold, and prominent on mobile');
  check(weatherReadability.factsColor === 'rgb(11, 102, 80)' && weatherReadability.factsSize >= 16, 'humidity, wind, and rain values have strong contrast');
  check(weatherReadability.scrollWidth <= weatherReadability.viewportWidth, 'weather route remains within mobile viewport');
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
