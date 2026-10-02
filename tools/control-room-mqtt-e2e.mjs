import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright-core';

const port = Number(process.env.CONTROL_ROOM_TEST_PORT || 4186);
const entry = process.env.CONTROL_ROOM_BASE || `http://127.0.0.1:${port}/control-room/`;
const remote = Boolean(process.env.CONTROL_ROOM_BASE);
const server = remote ? null : spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const mqttMock = `(() => {
  class FakeClient {
    constructor() { this.connected = false; this.handlers = new Map(); this.published = []; }
    on(name, fn) { const list = this.handlers.get(name) || []; list.push(fn); this.handlers.set(name, list); return this; }
    emit(name, ...args) { if (name === 'connect') this.connected = true; if (name === 'offline' || name === 'close') this.connected = false; (this.handlers.get(name) || []).forEach(fn => fn(...args)); }
    subscribe(topic, options, callback) { (window.__mqttSubscriptions ||= []).push(topic); callback?.(null); }
    publish(topic, payload, options, callback) { this.published.push({ topic, payload: String(payload), options }); (window.__mqttPublished ||= []).push({ topic, payload: String(payload), options }); callback?.(null); }
    end() { this.connected = false; }
  }
  window.__mqttConnectCount = 0;
  window.mqtt = { connect() { window.__mqttConnectCount++; const client = new FakeClient(); window.__mockMqttClient = client; setTimeout(() => client.emit('connect'), 0); return client; } };
})();`;
const firebaseMock = `window.FirebaseAuth = { token: '', refreshToken: '', user: null, async signIn(email){ this.token='mock-token'; this.refreshToken='mock-refresh'; this.user={ localId:'uid-test', email }; return this.user; }, refresh(){ return Promise.resolve(true); }, clear(){ this.token=''; this.refreshToken=''; this.user=null; } }; window.FirebaseDB = { async get(){ return null; }, async put(){}, async delete(){} };`;
let browser;

try {
  if (!remote) {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { const response = await fetch(entry); if (response.ok) { ready = true; break; } } catch (_) {}
      await wait(100);
    }
    if (!ready) throw new Error('local web server did not become ready');
  }

  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/mqtt.min.js*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: mqttMock }));
  await page.route('**/firebase.js*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: firebaseMock }));
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ current: { temperature_2m: 29, weather_code: 1, rain: 0 }, daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] } }) }));
  await page.addInitScript(() => {
    sessionStorage.setItem('smartfarm.dashboard.username', 'test-user');
    sessionStorage.setItem('smartfarm.dashboard.password', 'test-password');
    window.confirm = () => true;
  });
  await page.goto(entry, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForURL(/dashboard\/\?page=water/);
  await page.waitForFunction(() => window.__mockMqttClient?.connected === true, null, { timeout: 8000 });
  if (!await page.locator('[data-page-section="water"]').isVisible()) throw new Error('legacy Control Room did not redirect into the unified Water route');
  if (await page.evaluate(() => window.__mqttConnectCount) !== 1) throw new Error('unified dashboard must start exactly one MQTT connection');
  if (!await page.locator('[data-firmware-schedule-submit]').isDisabled()) throw new Error('ESP schedule command must remain disabled before live heartbeat');

  await page.evaluate(() => {
    const device = { device_id: 'SmartFarm-test', online: true, wifi: true, mqtt: true, firmware: 'V7.2.0-OTA-STABLE', uptimeSec: 120, rssi: -58, pumpSafeLock: false, emergencyLock: false };
    window.__mockMqttClient.emit('message', 'smartfarm/status/device', JSON.stringify(device), { retain: true });
  });
  if (!await page.locator('[data-firmware-schedule-submit]').isDisabled()) throw new Error('retained heartbeat must not enable ESP commands');
  await page.evaluate(() => {
    const device = { device_id: 'SmartFarm-test', online: true, wifi: true, mqtt: true, firmware: 'V7.2.0-OTA-STABLE', uptimeSec: 121, rssi: -58, pumpSafeLock: false, emergencyLock: false };
    window.__mockMqttClient.emit('message', 'smartfarm/status/device', JSON.stringify(device), { retain: false });
  });
  await page.waitForFunction(() => !document.querySelector('[data-firmware-schedule-submit]')?.disabled);
  await page.locator('[data-firmware-schedule-form] input[name="on"]').fill('06:30');
  await page.locator('[data-firmware-schedule-form] input[name="off"]').fill('07:15');
  await page.locator('[data-firmware-schedule-form]').evaluate(form => form.requestSubmit());
  const schedulePublish = await page.evaluate(() => window.__mqttPublished.at(-1));
  if (schedulePublish?.topic !== 'smartfarm/schedule/pump/set') throw new Error(`wrong ESP schedule topic: ${JSON.stringify(schedulePublish)}`);
  const schedulePayload = JSON.parse(schedulePublish.payload);
  if (schedulePayload.slots?.[0]?.on !== '06:30' || schedulePayload.slots?.[0]?.off !== '07:15' || schedulePublish.options?.retain !== false) throw new Error('ESP schedule payload must match firmware and be non-retained');

  await page.locator('nav.bottom-nav [data-shared-route="finance"]').click();
  await page.waitForFunction(() => document.querySelector('[data-page-section="finance"]') && !document.querySelector('[data-page-section="finance"]').hidden);
  if (await page.evaluate(() => window.__mqttConnectCount) !== 1) throw new Error('SPA route navigation must not start a second MQTT connection');
  if (!await page.locator('#financeForm').count()) throw new Error('finance entry form is missing from the unified route');
  if (await page.locator('[data-finance-content]').isVisible()) throw new Error('finance records must remain hidden before Firebase sign-in');
  await page.locator('[data-unified-auth-email]').fill('field-test@example.com');
  await page.locator('[data-unified-auth-password]').fill('mock-password');
  await page.locator('[data-unified-auth-form]').evaluate(form => form.requestSubmit());
  await page.waitForFunction(() => window.FirebaseAuth?.user?.localId === 'uid-test');
  if (!await page.locator('[data-finance-content]').isVisible()) throw new Error('Firebase sign-in did not reveal the authenticated finance view');
  if (await page.evaluate(() => window.__mqttConnectCount) !== 1) throw new Error('Firebase sign-in must not start another MQTT connection');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) throw new Error('unified dashboard overflows the 390px viewport');
  if (pageErrors.length) throw new Error(`uncaught browser errors: ${pageErrors.join(' | ')}`);

  console.log('PASS Control Room redirects to the single Water route; one MQTT client is retained');
  console.log('PASS retained heartbeat cannot unlock controls; live heartbeat gates ESP schedule command');
  console.log('PASS ESP schedule payload is correct/non-retained; Finance is protected by Firebase login and reuses the MQTT connection');
} finally {
  if (browser) await browser.close();
  if (server) { server.kill('SIGTERM'); await once(server, 'exit').catch(() => {}); }
}
