import { chromium } from 'playwright-core';

const base = process.env.DASHBOARD_BASE || 'https://klanarong156-pixel.github.io/New140869/dashboard/?page=dashboard&mobile-audit=7881bbe';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = [];
for (const viewport of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.status-banner');
  await new Promise(resolve => setTimeout(resolve, 350));
  const data = await page.evaluate(() => {
    const rect = selector => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }; };
    const all = selector => [...document.querySelectorAll(selector)].map(el => { const r = el.getBoundingClientRect(); return { text: el.textContent.trim(), x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), disabled: el.disabled }; });
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scroll: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      mqtt: document.querySelector('[data-mqtt-status]')?.textContent.trim(),
      esp: document.querySelector('[data-esp-status]')?.textContent.trim(),
      espTone: document.querySelector('[data-esp-shell]')?.dataset.tone,
      espDetail: document.querySelector('[data-esp-status-detail]')?.textContent.trim(),
      banner: rect('.status-banner'),
      hero: rect('.farm-hero'),
      metrics: all('.metric-grid > article'),
      relayCards: all('.compact-relays .relay-card'),
      relayGridColumns: getComputedStyle(document.querySelector('.compact-relays')).gridTemplateColumns,
      serviceWorker: navigator.serviceWorker.controller?.scriptURL || null,
      relayButtons: all('.compact-relays .button'),
      modeButtons: all('.route-page:not([hidden]) .mode-button'),
      bottomNav: rect('.bottom-nav'),
      errors: []
    };
  });
  data.errors = errors;
  const screenshot = `/tmp/dashboard-mobile-${viewport.width}.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  results.push({ ...data, screenshot });
  await page.close();
}
for (const result of results) {
  const noOverflow = result.scroll.width <= result.viewport.width;
  const statusVisible = result.esp.includes('ออฟไลน์') && result.espTone === 'bad' && result.banner.width <= result.viewport.width;
  const relayTwoColumns = result.relayCards.length === 4 && result.relayCards[0].y === result.relayCards[1].y && result.relayCards[2].y === result.relayCards[3].y;
  const buttonsVisible = result.relayButtons.length === 8 && result.relayButtons.every(button => button.width > 0 && button.height > 0);
  const modeVisible = result.modeButtons.length === 3 && result.modeButtons.every(button => button.width > 0 && button.height > 0);
  console.log(JSON.stringify({ viewport: result.viewport, screenshot: result.screenshot, noOverflow, statusVisible, relayTwoColumns, buttonsVisible, modeVisible, mqtt: result.mqtt, esp: result.esp, espTone: result.espTone, espDetail: result.espDetail, banner: result.banner, hero: result.hero, relayCards: result.relayCards, relayButtons: result.relayButtons, modeButtons: result.modeButtons, bottomNav: result.bottomNav, errors: result.errors }));
  if (!noOverflow || !statusVisible || !relayTwoColumns || !buttonsVisible || !modeVisible || result.errors.length) process.exitCode = 1;
}
await browser.close();
