import { chromium } from 'playwright-core';

const base = process.env.DASHBOARD_BASE || 'https://klanarong156-pixel.github.io/New140869/dashboard/?page=dashboard&real-esp=1';
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
  localStorage.removeItem('smartfarm.dashboard.username');
  localStorage.removeItem('smartfarm.dashboard.password');
  localStorage.setItem('smartfarm.mqtt.username', username);
  localStorage.setItem('smartfarm.mqtt.password', password);
}, { username, password });
await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => document.querySelector('[data-mqtt-status]')?.textContent.includes('เชื่อมต่อแล้ว'), null, { timeout: 30000 });
await page.waitForFunction(() => document.querySelector('[data-esp-status]')?.textContent.includes('ออนไลน์'), null, { timeout: 30000 });
const result = await page.evaluate(() => ({
  mqtt: document.querySelector('[data-mqtt-status]')?.textContent.trim(),
  esp: document.querySelector('[data-esp-status]')?.textContent.trim(),
  detail: document.querySelector('[data-esp-status-detail]')?.textContent.trim(),
  deviceId: document.querySelector('[data-esp-device-id]')?.textContent.trim(),
  firmware: document.querySelector('[data-firmware]')?.textContent.trim(),
  tone: document.querySelector('[data-esp-shell]')?.dataset.tone,
  dashboardPasswordKey: Boolean(localStorage.getItem('smartfarm.dashboard.password')),
  legacyPasswordKey: Boolean(localStorage.getItem('smartfarm.mqtt.password'))
}));
console.log(JSON.stringify(result));
if (!result.mqtt.includes('เชื่อมต่อแล้ว')) throw new Error(`MQTT did not connect: ${JSON.stringify(result)}`);
if (!result.esp.includes('ออนไลน์') || result.tone !== 'good') throw new Error(`ESP did not become online: ${JSON.stringify(result)}`);
if (result.deviceId !== 'SmartFarm-ESP8266') throw new Error(`wrong live device: ${JSON.stringify(result)}`);
if (!result.firmware.startsWith('V7.1.1')) throw new Error(`wrong live firmware: ${JSON.stringify(result)}`);
if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);
console.log('PASS: legacy MQTT credentials bridge to the unified dashboard and real ESP heartbeat is online');
await browser.close();
