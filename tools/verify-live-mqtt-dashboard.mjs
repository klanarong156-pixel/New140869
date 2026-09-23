import { chromium } from 'playwright-core';

const base = process.env.DASHBOARD_BASE || 'https://klanarong156-pixel.github.io/New140869/dashboard/?page=dashboard&live-mqtt-sim=1';
const username = process.env.HIVEMQ_USERNAME;
const password = process.env.HIVEMQ_PASSWORD;
if (!username || !password) throw new Error('Missing MQTT credentials in environment');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', error => errors.push(error.message));
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.evaluate(({ username, password }) => {
  localStorage.setItem('smartfarm.dashboard.username', username);
  localStorage.setItem('smartfarm.dashboard.password', password);
}, { username, password });
await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('[data-esp-status]');
await page.waitForFunction(() => document.querySelector('[data-mqtt-status]')?.textContent.includes('เชื่อมต่อแล้ว') || document.querySelector('[data-mqtt-status]')?.textContent.includes('เชื่อมต่อ'), null, { timeout: 30000 }).catch(() => {});
await page.waitForFunction(() => document.querySelector('[data-esp-status]')?.textContent.includes('ออนไลน์'), null, { timeout: 30000 }).catch(() => {});
const result = await page.evaluate(() => ({
  mqtt: document.querySelector('[data-mqtt-status]')?.textContent.trim(),
  esp: document.querySelector('[data-esp-status]')?.textContent.trim(),
  detail: document.querySelector('[data-esp-status-detail]')?.textContent.trim(),
  tone: document.querySelector('[data-esp-shell]')?.dataset.tone,
  deviceId: document.querySelector('[data-esp-device-id]')?.textContent.trim(),
  firmware: document.querySelector('[data-esp-firmware]')?.textContent.trim(),
  state: window.SmartFarmDashboardState.get().esp
}));
console.log(JSON.stringify(result));
if (!result.mqtt.includes('เชื่อมต่อ')) throw new Error(`MQTT did not connect: ${JSON.stringify(result)}`);
if (!result.esp.includes('ออนไลน์') || result.tone !== 'good') throw new Error(`ESP did not become online: ${JSON.stringify(result)}`);
if (result.deviceId !== 'esp8266-live-sim' || result.firmware !== 'V7.1.2-SIM') throw new Error(`simulated identity missing: ${JSON.stringify(result)}`);
if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);
console.log('PASS: public dashboard changed OFFLINE -> ONLINE from live MQTT simulation');
await browser.close();
