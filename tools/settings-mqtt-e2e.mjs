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
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium';

const MOCK_MQTT = `
(() => {
  class MockClient {
    constructor() { this.connected = false; this.handlers = new Map(); this.published = []; }
    on(name, fn) { this.handlers.set(name, fn); return this; }
    emit(name, ...args) { this.handlers.get(name)?.(...args); }
    subscribe(_topic, _options, callback) { setTimeout(() => callback?.(null), 0); }
    publish(topic, payload, options, callback) {
      this.published.push({ topic, payload, options });
      setTimeout(() => callback?.(null), 5);
    }
    end() { this.connected = false; this.emit('close'); }
  }
  self.mqtt = { connect() {
    const client = new MockClient();
    self.__mockMqttClient = client;
    setTimeout(() => { client.connected = true; client.emit('connect'); }, 10);
    return client;
  }};
})();
`;

async function serveFile(filePath, response) {
  try {
    const data = await fs.readFile(filePath);
    const type = filePath.endsWith('.html') ? 'text/html; charset=utf-8'
      : filePath.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8';
    response.writeHead(200, { 'Content-Type': type });
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
  const requestPath = url.pathname === '/dashboard/' ? '/dashboard/index.html' : url.pathname;
  const safePath = path.normalize(requestPath).replace(/^\.\.(\/|\\)/, '');
  await serveFile(path.join(ROOT, safePath), response);
});

function check(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

async function openConnectionPage(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`http://${HOST}:${PORT}/dashboard/?page=connection`, { waitUntil: 'networkidle' });
  return { context, page };
}

async function main() {
  await new Promise(resolve => server.listen(PORT, HOST, resolve));
  const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] });
  try {
    const { context, page } = await openConnectionPage(browser);
    check(await page.locator('[data-credential-form]').count() === 1, 'Canonical connection page loaded MQTT credential form');
    await page.locator('[data-mqtt-username]').fill(TEST_USER);
    await page.locator('[data-mqtt-password]').fill(TEST_PASS);
    await page.locator('[data-credential-form] button[type="submit"]').click();
    await page.waitForFunction(() => window.SmartFarmDashboardState?.get()?.mqtt?.status === 'connected');

    const storage = await page.evaluate(() => ({
      unifiedUser: localStorage.getItem('smartfarm.dashboard.username'),
      unifiedPass: localStorage.getItem('smartfarm.dashboard.password'),
      legacyUser: localStorage.getItem('smartfarm.mqtt.username'),
      legacyPass: localStorage.getItem('smartfarm.mqtt.password'),
      connected: window.SmartFarmDashboardMqtt.client?.connected === true
    }));
    check(storage.unifiedUser === TEST_USER && storage.unifiedPass === TEST_PASS, 'Unified dashboard credentials are saved in localStorage');
    check(storage.legacyUser === TEST_USER && storage.legacyPass === TEST_PASS, 'Legacy dashboard credentials stay synchronized');
    check(storage.connected === true, 'Primary MQTT client reports connected');

    const publish = await page.evaluate(() => {
      const ok = window.SmartFarmDashboardMqtt.publish('smartfarm/relay/pump/set', 'ON');
      return { ok, published: window.__mockMqttClient?.published || [] };
    });
    check(publish.ok === true, 'Relay command publishes through the unified MQTT manager');
    check(publish.published[0]?.topic === 'smartfarm/relay/pump/set'
      && publish.published[0]?.payload === 'ON'
      && publish.published[0]?.options?.qos === 1
      && publish.published[0]?.options?.retain === false, 'Critical relay command uses QoS 1 without retain');
    await context.close();

    const incomplete = await openConnectionPage(browser);
    await incomplete.page.locator('[data-mqtt-username]').fill(TEST_USER);
    await incomplete.page.locator('[data-credential-form]').evaluate(form => form.requestSubmit());
    await new Promise(resolve => setTimeout(resolve, 50));
    check(await incomplete.page.evaluate(() => !localStorage.getItem('smartfarm.dashboard.password')), 'Incomplete credentials are not saved');
    await incomplete.context.close();

    console.log('E2E RESULT: Canonical Settings + MQTT integration passed');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error.stack || error);
  server.close(() => process.exit(1));
});
