import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright-core';

const port = Number(process.env.CONTROL_ROOM_TEST_PORT || 4186);
const url = process.env.CONTROL_ROOM_BASE || `http://127.0.0.1:${port}/control-room/`;
const remote = Boolean(process.env.CONTROL_ROOM_BASE);
const server = remote ? null : spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const mqttMock = `(() => {
  class FakeClient {
    constructor() { this.connected = false; this.handlers = new Map(); }
    on(name, fn) { const list = this.handlers.get(name) || []; list.push(fn); this.handlers.set(name, list); return this; }
    emit(name, ...args) { if (name === 'connect') this.connected = true; if (name === 'offline' || name === 'close') this.connected = false; (this.handlers.get(name) || []).forEach(fn => fn(...args)); }
    subscribe(topic, options, callback) { (window.__mqttSubscriptions ||= []).push(topic); callback?.(null); }
    publish(topic, payload, options, callback) { (window.__mqttPublished ||= []).push({ topic, payload: String(payload), options }); callback?.(null); }
    end() { this.connected = false; }
  }
  window.mqtt = { connect() { const client = new FakeClient(); window.__mockMqttClient = client; setTimeout(() => client.emit('connect'), 0); return client; } };
})();`;
const firebaseMock = `window.FirebaseAuth = { token: 'test-token', user: { localId: 'uid-browser-test', email: 'test@example.com' } }; window.FirebaseDB = { async get() { return {}; }, async put() {}, async delete() {} };`;
let browser;

try {
  if (!remote) {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try { const response = await fetch(url); if (response.ok) { ready = true; break; } } catch (_) {}
      await wait(100);
    }
    if (!ready) throw new Error('local Control Room server did not become ready');
  }

  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/mqtt.min.js*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: mqttMock }));
  await page.route('**/firebase.js*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: firebaseMock }));
  await page.addInitScript(() => {
    sessionStorage.setItem('smartfarm.dashboard.username', 'test-user');
    sessionStorage.setItem('smartfarm.dashboard.password', 'test-password');
    window.confirm = () => true;
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__mockMqttClient?.connected === true, null, { timeout: 5000 });
  await page.waitForFunction(() => document.querySelector('[data-control-mqtt-state] span')?.textContent.includes('เชื่อมต่อแล้ว'), null, { timeout: 5000 });
  const initiallyDisabled = await page.locator('[data-relay="pump"][data-value="ON"]').isDisabled();
  if (!initiallyDisabled) throw new Error('relay command must remain disabled until a fresh ESP heartbeat and status arrive');

  await page.evaluate(() => {
    const client = window.__mockMqttClient;
    const msg = (topic, payload, retain = true) => client.emit('message', topic, payload, { retain });
    msg('smartfarm/status/device', JSON.stringify({ device_id: 'SmartFarm-test', online: true, wifi: true, mqtt: true, firmware: 'V7.2.0-OTA-STABLE', uptimeSec: 120, rssi: -58, heap: 32000, heapFrag: 12, resetReason: 'External System', otaReady: true, otaStatus: 'READY', pumpSafeLock: false, emergencyLock: false }), true);
  });
  await page.waitForFunction(() => document.querySelector('[data-control-firmware]')?.textContent === 'V7.2.0-OTA-STABLE');
  if (await page.locator('[data-control-relay-state="pump"]').textContent() !== 'ยังไม่มีข้อมูล') throw new Error('missing relay status was incorrectly rendered as OFF');
  if (await page.locator('[data-control-ota]').textContent() !== 'READY') throw new Error('OTA status did not come from heartbeat');

  await page.evaluate(() => {
    const client = window.__mockMqttClient;
    const msg = (topic, payload, retain = true) => client.emit('message', topic, payload, { retain });
    for (const relay of ['pump', 'zone1', 'lighthome', 'lightsala']) msg(`smartfarm/relay/${relay}/status`, 'OFF', true);
    msg('smartfarm/mode/status', 'AUTO', true);
    msg('smartfarm/emergency/status', JSON.stringify({ active: false, source: '' }), true);
    msg('smartfarm/sensor/dht11', JSON.stringify({ temperature: 28.5, humidity: 72, unit_temperature: 'C', unit_humidity: '%' }), false);
  });
  await page.waitForFunction(() => document.querySelector('[data-control-relay-state="pump"]')?.textContent === 'ปิด');
  if (await page.locator('[data-control-relay-state="pump"]').textContent() !== 'ปิด') throw new Error('initial relay state did not come from MQTT status');
  await page.locator('[data-relay="pump"][data-value="ON"]').click();
  const relayAfterCommand = await page.locator('[data-control-relay-state="pump"]').textContent();
  const relayPublish = await page.evaluate(() => window.__mqttPublished.at(-1));
  if (relayPublish?.topic !== 'smartfarm/relay/pump/set' || relayPublish.payload !== 'ON') throw new Error(`wrong relay publish: ${JSON.stringify(relayPublish)}`);
  if (relayAfterCommand !== 'ปิด') throw new Error('relay UI changed optimistically before ESP status');
  await page.evaluate(() => window.__mockMqttClient.emit('message', 'smartfarm/relay/pump/status', 'ON', { retain: true }));
  if (await page.locator('[data-control-relay-state="pump"]').textContent() !== 'เปิด') throw new Error('relay state did not update from ESP status');
  await page.locator('[data-relay="pump"][data-value="OFF"]').click();
  const relayOffPublish = await page.evaluate(() => window.__mqttPublished.at(-1));
  if (relayOffPublish?.topic !== 'smartfarm/relay/pump/set' || relayOffPublish.payload !== 'OFF') throw new Error(`wrong relay OFF publish: ${JSON.stringify(relayOffPublish)}`);
  if (await page.locator('[data-control-relay-state="pump"]').textContent() !== 'เปิด') throw new Error('relay OFF command changed UI optimistically');
  await page.evaluate(() => window.__mockMqttClient.emit('message', 'smartfarm/relay/pump/status', 'OFF', { retain: true }));

  await page.locator('[data-control-mode="MANUAL"]').click();
  const modePublish = await page.evaluate(() => window.__mqttPublished.at(-1));
  if (modePublish?.topic !== 'smartfarm/mode/set' || modePublish.payload !== 'MANUAL') throw new Error(`wrong mode publish: ${JSON.stringify(modePublish)}`);
  if (await page.locator('[data-control-mode-status]').textContent() !== 'AUTO') throw new Error('mode UI changed before ESP status');
  await page.evaluate(() => window.__mockMqttClient.emit('message', 'smartfarm/mode/status', 'MANUAL', { retain: true }));
  if (await page.locator('[data-control-mode-status]').textContent() !== 'MANUAL') throw new Error('mode status did not update from ESP');
  await page.locator('[data-control-mode="AUTO"]').click();
  const autoPublish = await page.evaluate(() => window.__mqttPublished.at(-1));
  if (autoPublish?.topic !== 'smartfarm/mode/set' || autoPublish.payload !== 'AUTO') throw new Error(`wrong mode AUTO publish: ${JSON.stringify(autoPublish)}`);
  if (await page.locator('[data-control-mode-status]').textContent() !== 'MANUAL') throw new Error('AUTO mode changed UI before ESP status');
  await page.evaluate(() => window.__mockMqttClient.emit('message', 'smartfarm/mode/status', 'AUTO', { retain: true }));
  if (await page.locator('[data-control-mode-status]').textContent() !== 'AUTO') throw new Error('AUTO status did not update from ESP');

  await page.locator('[data-control-emergency="STOP"]').click();
  const stopPublish = await page.evaluate(() => window.__mqttPublished.at(-1));
  if (stopPublish?.topic !== 'smartfarm/emergency/set' || stopPublish.payload !== 'STOP') throw new Error(`wrong emergency STOP publish: ${JSON.stringify(stopPublish)}`);
  if (await page.locator('[data-control-emergency-status]').textContent() !== 'ปกติ') throw new Error('emergency UI changed before ESP status');
  await page.evaluate(() => window.__mockMqttClient.emit('message', 'smartfarm/emergency/status', JSON.stringify({ active: true, source: 'mqtt' }), { retain: true }));
  if (!(await page.locator('[data-control-emergency-status]').textContent()).includes('หยุดฉุกเฉินทำงาน')) throw new Error('emergency status did not update from ESP');
  await page.locator('[data-control-emergency="RESET"]').click();
  const resetPublish = await page.evaluate(() => window.__mqttPublished.at(-1));
  if (resetPublish?.topic !== 'smartfarm/emergency/set' || resetPublish.payload !== 'RESET') throw new Error(`wrong emergency reset publish: ${JSON.stringify(resetPublish)}`);

  await page.evaluate(() => window.__mockMqttClient.emit('message', 'smartfarm/status/online', 'false', { retain: true }));
  if (!(await page.locator('[data-control-interlock]').textContent()).includes('ESP8266 ออฟไลน์ — ยังส่งคำสั่งไม่ได้')) throw new Error('offline interlock message missing');
  await page.evaluate(() => window.__mockMqttClient.emit('offline'));
  if (!(await page.locator('[data-control-mqtt-state] span').textContent()).includes('ออฟไลน์')) throw new Error('MQTT disconnected state did not render');
  const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  if (layout.width > layout.viewport) throw new Error(`mobile horizontal overflow: ${JSON.stringify(layout)}`);
  if (pageErrors.length) throw new Error(`uncaught browser errors: ${pageErrors.join(' | ')}`);
  console.log('PASS Control Room uses shared MQTT adapter and V7.2.0 command/status contracts');
  console.log('PASS relay, mode, emergency commands wait for ESP status and do not update optimistically');
  console.log('PASS ESP offline interlock and 390px mobile overflow checks');
} finally {
  if (browser) await browser.close();
  if (server) { server.kill('SIGTERM'); await once(server, 'exit').catch(() => {}); }
}
