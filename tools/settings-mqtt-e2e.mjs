#!/usr/bin/env node

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname);
const PORT = 4187;
const HOST = '127.0.0.1';
const TEST_USER = 'e2e-test-user';
const TEST_PASS = 'e2e-test-password';

const MOCK_MQTT = `
(() => {
  class MockClient {
    constructor() { this.connected = false; this.handlers = new Map(); }
    on(name, fn) { this.handlers.set(name, fn); return this; }
    emit(name, ...args) { this.handlers.get(name)?.(...args); }
    subscribe(_topic, _options, callback) { setTimeout(() => callback?.(null), 0); }
    publish(topic, payload, options, callback) {
      setTimeout(() => callback?.(null, { topic, qos: options?.qos ?? 0, retain: options?.retain ?? false }), 5);
    }
    end() { this.connected = false; this.emit('close'); }
  }
  self.mqtt = { connect() {
    const client = new MockClient();
    setTimeout(() => { client.connected = true; client.emit('connect'); }, 10);
    return client;
  }};
})();
`;

async function serveFile(filePath, response) {
  try {
    const data = await fs.readFile(filePath);
    response.writeHead(200, { 'Content-Type': filePath.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript; charset=utf-8' });
    response.end(data);
  } catch (_) {
    response.writeHead(404);
    response.end('not found');
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  if (url.pathname === '/mqtt.min.js') {
    response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    response.end(MOCK_MQTT);
    return;
  }
  if (url.pathname === '/settings.html') {
    let html = await fs.readFile(path.join(ROOT, 'settings.html'), 'utf8');
    html = html.replace('data-auth-required="true" data-admin-required="true"', '');
    html = html.replace(/<script src="access\.js[^>]*><\/script>/, '');
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
    return;
  }
  const safePath = path.normalize(url.pathname).replace(/^\.\.(\/|\\)/, '');
  await serveFile(path.join(ROOT, safePath), response);
});

function check(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

async function main() {
  await new Promise(resolve => server.listen(PORT, HOST, resolve));
  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`http://${HOST}:${PORT}/settings.html`, { waitUntil: 'networkidle' });

    check(await page.locator('[data-mqtt-setup]').count() === 1, 'Settings page loaded MQTT setup control');
    check((await page.locator('#mqttStatusText').textContent()).includes('ขาด username และ password'), 'Incomplete credentials are reported before auto-connect');

    await page.locator('[data-mqtt-setup]').click();
    check(await page.locator('#mqttSetupForm').count() === 1, 'Credential modal opens');
    check(await page.locator('#mqttSetupForm button[type="submit"]').isDisabled(), 'Save is disabled while credentials are incomplete');

    await page.locator('#mqttUsername').fill(TEST_USER);
    check(await page.locator('#mqttSetupForm button[type="submit"]').isDisabled(), 'Save remains disabled when password is missing');
    await page.locator('#mqttPassword').fill(TEST_PASS);
    check(!(await page.locator('#mqttSetupForm button[type="submit"]').isDisabled()), 'Save becomes enabled when both credentials are present');
    await page.locator('#mqttSetupForm button[type="submit"]').click();

    await page.waitForFunction(() => window.APP_STATE?.mqttConnected === true);
    const storage = await page.evaluate(() => ({
      sessionUser: sessionStorage.getItem('smartfarm.mqtt.username'),
      sessionPass: sessionStorage.getItem('smartfarm.mqtt.password'),
      localUser: localStorage.getItem('smartfarm.mqtt.username'),
      localPass: localStorage.getItem('smartfarm.mqtt.password'),
      connected: window.APP_STATE.mqttConnected
    }));
    check(storage.sessionUser === TEST_USER && storage.sessionPass === TEST_PASS, 'Credentials are saved in sessionStorage when remember is off');
    check(storage.localUser === null && storage.localPass === null, 'Credentials are not copied to localStorage by default');
    check(storage.connected === true, 'SharedWorker mock reports MQTT connected');

    const ack = await page.evaluate(async () => new Promise(resolve => {
      const listener = event => { window.removeEventListener('mqtt:publish-ack', listener); resolve({ requestId: event.detail?.requestId, topic: event.detail?.topic }); };
      window.addEventListener('mqtt:publish-ack', listener);
      window.mqttHandler.publish('smartfarm/test/settings-e2e', 'ack-check', { qos: 0, retain: false });
    }));
    check(ack.topic === 'smartfarm/test/settings-e2e' && Boolean(ack.requestId), 'Publish acknowledgement arrives through SharedWorker');
    await page.evaluate(() => {
      window.APP_STATE.mqttConnected = false;
      window.dispatchEvent(new Event('online'));
    });
    await page.waitForFunction(() => window.APP_STATE?.mqttConnected === true);
    check(true, 'Browser online event restores MQTT connected state');
    await context.close();

    const incompleteContext = await browser.newContext();
    const incompletePage = await incompleteContext.newPage();
    await incompletePage.goto(`http://${HOST}:${PORT}/settings.html`, { waitUntil: 'networkidle' });
    await incompletePage.locator('[data-mqtt-setup]').click();
    await incompletePage.locator('#mqttUsername').fill(TEST_USER);
    await incompletePage.locator('#mqttSetupForm').dispatchEvent('submit');
    check(await incompletePage.locator('#mqttSetupForm').count() === 1, 'Incomplete submission does not close the credential modal');
    check((await incompletePage.locator('[role="status"]').last().textContent()).includes('password'), 'Incomplete submission identifies the missing password');
    await incompleteContext.close();

    console.log('E2E RESULT: Settings + MQTT simulated integration passed');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error.stack || error);
  server.close(() => process.exit(1));
});
