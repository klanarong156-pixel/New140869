(() => {
  'use strict';

  const TIME_ZONE = 'Asia/Bangkok';
  const SYNC_INTERVAL_MS = 15 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 8000;
  const SOURCES = [
    `https://timeapi.io/api/time/current/zone?timeZone=${encodeURIComponent(TIME_ZONE)}`,
    `https://worldtimeapi.org/api/timezone/${TIME_ZONE}`
  ];

  let synced = false;
  let offsetMs = 0;
  let baseServerMs = 0;
  let baseMonotonicMs = 0;
  let source = '';
  let timer = null;

  const monotonicNow = () => (typeof performance !== 'undefined' && Number.isFinite(performance.now()) ? performance.now() : Date.now());
  const dispatch = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

  function currentMs() {
    if (!synced) return Date.now();
    return baseServerMs + (monotonicNow() - baseMonotonicMs);
  }

  function parseServerMs(data) {
    const candidates = [data?.dateTime, data?.datetime, data?.utc_datetime, data?.currentDateTime];
    for (const value of candidates) {
      const text = String(value || '').trim();
      if (!text) continue;
      // TimeAPI may return Asia/Bangkok local time without an offset. Add the
      // fixed UTC+07:00 offset so parsing is identical in every browser locale.
      const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}+07:00`;
      const parsed = Date.parse(normalized);
      if (Number.isFinite(parsed)) return parsed;
    }
    const unix = Number(data?.unixtime ?? data?.unixTime);
    if (Number.isFinite(unix) && unix > 0) return unix * 1000;
    return NaN;
  }

  async function fetchWithTimeout(url) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const serverMs = parseServerMs(data);
      if (!Number.isFinite(serverMs)) throw new Error('รูปแบบเวลาจากบริการไม่ถูกต้อง');
      return { serverMs, url };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function sync() {
    const startedAt = Date.now();
    let lastError = null;
    for (const url of SOURCES) {
      try {
        const result = await fetchWithTimeout(url);
        const receivedAt = Date.now();
        baseServerMs = result.serverMs + Math.max(0, receivedAt - startedAt) / 2;
        baseMonotonicMs = monotonicNow();
        offsetMs = baseServerMs - receivedAt;
        synced = true;
        source = new URL(result.url).hostname;
        dispatch('internet-time:updated', { synced, source, offsetMs, at: baseServerMs });
        return new Date(baseServerMs);
      } catch (error) {
        lastError = error;
      }
    }
    dispatch('internet-time:error', { synced, source, message: lastError?.message || 'ไม่สามารถดึงเวลาจากอินเทอร์เน็ตได้' });
    return null;
  }

  function start() {
    if (timer) return;
    sync();
    timer = window.setInterval(sync, SYNC_INTERVAL_MS);
  }

  window.InternetTime = Object.freeze({
    zone: TIME_ZONE,
    now: () => new Date(currentMs()),
    isSynced: () => synced,
    source: () => source,
    offsetMs: () => offsetMs,
    sync,
    start
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
