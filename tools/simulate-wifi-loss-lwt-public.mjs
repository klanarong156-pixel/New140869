import { chromium } from 'playwright-core';

const base = process.env.DASHBOARD_BASE || 'https://klanarong156-pixel.github.io/New140869/dashboard/?page=connection&wifi-loss-test=1';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', error => errors.push(error.message));
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('[data-esp-status]');
await new Promise(resolve => setTimeout(resolve, 300));

const readUi = () => page.evaluate(() => ({
  espStatus: document.querySelector('[data-esp-status]')?.textContent.trim(),
  detail: document.querySelector('[data-esp-status-detail]')?.textContent.trim(),
  tone: document.querySelector('[data-esp-shell]')?.dataset.tone,
  deviceId: document.querySelector('[data-esp-device-id]')?.textContent.trim(),
  heartbeat: document.querySelector('[data-esp-last-seen]')?.textContent.trim(),
  reason: document.querySelector('[data-diagnostic-reason]')?.textContent.trim(),
  state: window.SmartFarmDashboardState.get().esp,
  mqtt: window.SmartFarmDashboardState.get().mqtt
}));

const topic = await page.evaluate(() => window.SmartFarmDashboardConfig.topics);
const onlineHeartbeat = {
  device_id: 'esp8266-wifi-test', online: true, wifi: true, mqtt: true,
  firmware: 'V7.1.2', rssi: -64, uptimeSec: 900
};
await page.evaluate(({ topic, heartbeat }) => {
  const manager = window.SmartFarmDashboardMqtt;
  const store = window.SmartFarmDashboardState;
  store.markMqtt('connected', { reason: 'test broker connected' });
  manager.handleMessage(topic.device, JSON.stringify(heartbeat), { retain: false });
}, { topic, heartbeat: onlineHeartbeat });
await new Promise(resolve => setTimeout(resolve, 120));
const online = await readUi();
if (!online.espStatus.includes('ออนไลน์') || online.tone !== 'good') throw new Error(`online setup failed: ${JSON.stringify(online)}`);

await page.evaluate(topic => {
  window.SmartFarmDashboardMqtt.handleMessage(topic, 'false', { retain: true });
}, topic.online);
await new Promise(resolve => setTimeout(resolve, 120));
const offline = await readUi();
if (!offline.espStatus.includes('ออฟไลน์')) throw new Error(`LWT did not make ESP offline: ${JSON.stringify(offline)}`);
if (offline.tone !== 'bad') throw new Error(`LWT offline tone incorrect: ${JSON.stringify(offline)}`);
if (offline.reason !== 'status/online=false') throw new Error(`LWT reason missing: ${JSON.stringify(offline)}`);
if (!offline.detail.includes('LWT')) throw new Error(`LWT detail was not visible: ${JSON.stringify(offline)}`);
if (offline.deviceId !== 'esp8266-wifi-test') throw new Error(`device identity was lost: ${JSON.stringify(offline)}`);
if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);

console.log('ONLINE_BEFORE_WIFI_LOSS', JSON.stringify(online));
console.log('OFFLINE_AFTER_LWT', JSON.stringify(offline));
console.log('PASS: public dashboard rendered ESP Offline after simulated WiFi-loss LWT');
await browser.close();
