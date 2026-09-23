import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright-core';

const port = Number(process.env.HEARTBEAT_TEST_PORT || 4183);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
const base = `http://127.0.0.1:${port}/dashboard/?page=devices&heartbeat-test=1`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  await wait(500);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-esp-status]');
  await wait(300);

  const snapshot = () => page.evaluate(() => ({
    header: document.querySelector('[data-esp-status]')?.textContent.trim(),
    bannerDetail: document.querySelector('[data-esp-status-detail]')?.textContent.trim(),
    deviceId: document.querySelector('[data-esp-device-id]')?.textContent.trim(),
    firmware: document.querySelector('[data-esp-firmware]')?.textContent.trim(),
    lastSeen: document.querySelector('[data-esp-last-seen]')?.textContent.trim(),
    deviceBadge: document.querySelector('[data-esp-badge]')?.textContent.trim(),
    tone: document.querySelector('[data-esp-shell]')?.dataset.tone,
    state: window.SmartFarmDashboardState.get().esp
  }));

  const initial = await snapshot();
  if (!initial.header.includes('ออฟไลน์')) throw new Error(`initial ESP status was not offline: ${initial.header}`);

  const topic = await page.evaluate(() => window.SmartFarmDashboardConfig.topics.device);
  const heartbeat = {
    device_id: 'esp8266-sim-01',
    online: true,
    wifi: true,
    mqtt: true,
    firmware: 'V7.1.2',
    rssi: -62,
    uptimeSec: 3723,
    heap: 28432,
    resetReason: 'Power On'
  };

  const retained = await page.evaluate(({ topic, heartbeat }) => {
    window.SmartFarmDashboardMqtt.handleMessage(topic, JSON.stringify(heartbeat), { retain: true });
    return window.SmartFarmDashboardState.get().esp;
  }, { topic, heartbeat });
  await wait(100);
  const afterRetained = await snapshot();
  if (afterRetained.header.includes('ออนไลน์')) throw new Error(`retained snapshot incorrectly marked online: ${JSON.stringify(afterRetained)}`);

  const live = await page.evaluate(({ topic, heartbeat }) => {
    const next = { ...heartbeat, uptimeSec: heartbeat.uptimeSec + 5 };
    window.SmartFarmDashboardMqtt.handleMessage(topic, JSON.stringify(next), { retain: false });
    return window.SmartFarmDashboardState.get().esp;
  }, { topic, heartbeat });
  await wait(150);
  const afterLive = await snapshot();
  if (!afterLive.header.includes('ออนไลน์')) throw new Error(`live heartbeat did not mark online: ${JSON.stringify(afterLive)}`);
  if (afterLive.deviceId !== 'esp8266-sim-01' || afterLive.firmware !== 'V7.1.2') throw new Error(`device details did not render: ${JSON.stringify(afterLive)}`);
  if (afterLive.tone !== 'good') throw new Error(`online tone was not good: ${JSON.stringify(afterLive)}`);
  if (afterLive.state.heartbeatCount !== 2 || live.online !== true) throw new Error(`heartbeat state count/online incorrect: ${JSON.stringify(afterLive)}`);
  if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);

  console.log('INITIAL', JSON.stringify(initial));
  console.log('RETAINED_SNAPSHOT', JSON.stringify(afterRetained));
  console.log('LIVE_HEARTBEAT', JSON.stringify(afterLive));
  console.log('PASS: simulated ESP heartbeat changed dashboard ESP status to ONLINE');
  await browser.close();
} finally {
  server.kill('SIGTERM');
  await once(server, 'exit').catch(() => {});
}
