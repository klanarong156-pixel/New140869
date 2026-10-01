import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright-core';

const port = Number(process.env.FIREBASE_SCHEDULE_TEST_PORT || 4185);
const url = process.env.URL || `http://127.0.0.1:${port}/control-room/`;
const remote = Boolean(process.env.URL);
const server = remote ? null : spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const firebaseMock = `window.__remote = { controlRoomSchedules: { 'seed-existing': { id: 'seed-existing', relay: 'pump', onTime: '06:00', offTime: '18:00', days: ['mon', 'tue'], enabled: true, updatedAt: '2026-10-01T00:00:00.000Z' } } };
window.FirebaseAuth = { token: 'test-token', user: { localId: 'uid-test', email: 'test@example.com' } };
window.FirebaseDB = {
  async get(path) { return path === 'controlRoomSchedules' ? structuredClone(window.__remote.controlRoomSchedules || {}) : null; },
  async put(path, data) { const prefix = 'controlRoomSchedules/'; if (path === 'controlRoomSchedules') window.__remote.controlRoomSchedules = structuredClone(data); else if (path.startsWith(prefix)) window.__remote.controlRoomSchedules[decodeURIComponent(path.slice(prefix.length))] = structuredClone(data); return data; },
  async delete(path) { const prefix = 'controlRoomSchedules/'; if (path.startsWith(prefix)) delete window.__remote.controlRoomSchedules[decodeURIComponent(path.slice(prefix.length))]; }
};`;
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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/firebase.js*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: firebaseMock }));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('[data-firebase-schedule-status]')?.textContent.includes('ซิงค์ Firebase แล้ว'));
  if (await page.locator('#scheduleCount').textContent() !== '1 รายการ') throw new Error('Firebase read did not render seeded record');
  if (await page.locator('.schedule-item[data-id="seed-existing"]').count() !== 1) throw new Error('seeded Firebase record missing from UI');

  await page.locator('.schedule-item[data-id="seed-existing"] [data-action="edit"]').click();
  await page.fill('input[name=offTime]', '19:00');
  await page.click('.save-schedule');
  await page.waitForFunction(() => window.__remote.controlRoomSchedules['seed-existing']?.offTime === '19:00');
  if (await page.locator('.schedule-item[data-id="seed-existing"] strong').textContent() !== '06:00 → 19:00') throw new Error('edited schedule did not render');

  await page.locator('.schedule-item[data-id="seed-existing"] label.mini-switch').click();
  await page.waitForFunction(() => window.__remote.controlRoomSchedules['seed-existing']?.enabled === false);
  if (await page.locator('.schedule-item[data-id="seed-existing"] [data-action="toggle"]').isChecked()) throw new Error('toggle state did not render');

  await page.selectOption('select[name=relay]', 'zone1');
  await page.fill('input[name=onTime]', '19:00');
  await page.fill('input[name=offTime]', '21:30');
  await page.click('.save-schedule');
  await page.waitForFunction(() => Object.keys(window.__remote.controlRoomSchedules).length === 2);
  if (await page.locator('#scheduleCount').textContent() !== '2 รายการ') throw new Error('create schedule did not render');

  const zoneCard = page.locator('.schedule-item').filter({ hasText: 'Zone 1' });
  await zoneCard.locator('[data-action="delete"]').click();
  await page.waitForFunction(() => Object.keys(window.__remote.controlRoomSchedules).length === 1);
  if (await page.locator('#scheduleCount').textContent() !== '1 รายการ') throw new Error('delete schedule did not render');
  if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);

  const result = await page.evaluate(() => ({ remote: window.__remote.controlRoomSchedules, status: document.querySelector('[data-firebase-schedule-status]')?.textContent, count: document.querySelector('#scheduleCount')?.textContent }));
  console.log(JSON.stringify(result, null, 2));
  console.log('PASS Control Room Firebase schedule read/create/edit/toggle/delete contract (mocked browser backend)');

  const unauthContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const unauthPage = await unauthContext.newPage();
  const unauthMock = `window.__firebaseCalls = 0; window.FirebaseAuth = { token: '', user: null }; window.FirebaseDB = { async get() { window.__firebaseCalls++; return {}; }, async put() { window.__firebaseCalls++; }, async delete() { window.__firebaseCalls++; } };`;
  await unauthPage.route('**/firebase.js*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: unauthMock }));
  await unauthPage.goto(url, { waitUntil: 'networkidle' });
  await unauthPage.waitForFunction(() => document.querySelector('[data-firebase-schedule-status]')?.textContent.includes('กรุณาเข้าสู่ระบบ'));
  await unauthPage.selectOption('select[name=relay]', 'zone1');
  await unauthPage.fill('input[name=onTime]', '20:00');
  await unauthPage.fill('input[name=offTime]', '21:00');
  await unauthPage.click('.save-schedule');
  await unauthPage.waitForFunction(() => document.querySelector('[data-firebase-schedule-status]')?.textContent.includes('ยังไม่ล็อกอิน'));
  const unauthResult = await unauthPage.evaluate(() => ({ firebaseCalls: window.__firebaseCalls, localCount: JSON.parse(localStorage.getItem('suanlungna.control-room.schedules.v1.guest') || '[]').length, status: document.querySelector('[data-firebase-schedule-status]')?.textContent }));
  if (unauthResult.firebaseCalls !== 0 || unauthResult.localCount !== 1 || !unauthResult.status.includes('ชั่วคราวในเครื่อง')) throw new Error(`unauthenticated schedule behavior is unsafe/unclear: ${JSON.stringify(unauthResult)}`);
  console.log('PASS unauthenticated schedule is labelled local-only and does not call Firebase');

  const otherUserPage = await unauthContext.newPage();
  const otherUserMock = `window.__firebaseCalls = 0; window.FirebaseAuth = { token: 'other-user-token', user: { localId: 'uid-other', email: 'other@example.com' } }; window.FirebaseDB = { async get() { window.__firebaseCalls++; return {}; }, async put() { window.__firebaseCalls++; }, async delete() { window.__firebaseCalls++; } };`;
  await otherUserPage.route('**/firebase.js*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: otherUserMock }));
  await otherUserPage.goto(url, { waitUntil: 'networkidle' });
  await otherUserPage.waitForFunction(() => document.querySelector('[data-firebase-schedule-status]')?.textContent.includes('ซิงค์ Firebase แล้ว'));
  const isolatedResult = await otherUserPage.evaluate(() => ({ firebaseCalls: window.__firebaseCalls, count: document.querySelector('#scheduleCount')?.textContent, uidCache: JSON.parse(localStorage.getItem('suanlungna.control-room.schedules.v1.uid-other') || 'null'), guestCacheCount: JSON.parse(localStorage.getItem('suanlungna.control-room.schedules.v1.guest') || '[]').length }));
  if (isolatedResult.firebaseCalls !== 1 || isolatedResult.count !== '0 รายการ' || isolatedResult.uidCache?.length !== 0 || isolatedResult.guestCacheCount !== 1) throw new Error(`schedule cache crossed account boundary: ${JSON.stringify(isolatedResult)}`);
  console.log('PASS schedule cache is scoped per Firebase UID and does not migrate guest data to another user');
  await unauthContext.close();
} finally {
  if (browser) await browser.close();
  if (server) { server.kill('SIGTERM'); await once(server, 'exit').catch(() => {}); }
}
