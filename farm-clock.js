(() => {
  'use strict';

  const dateFormatter = new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const timeFormatter = new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  let rtcEpochMs = 0;
  let lastHeartbeatAt = 0;
  let hasRtcTime = false;
  let internetError = false;

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach(element => { element.textContent = value; });
  }

  function renderDate(current, source) {
    setText('[data-farm-time]', timeFormatter.format(current));
    setText('[data-farm-date]', dateFormatter.format(current));
    setText('[data-farm-clock-source]', source);
  }

  function render() {
    if (window.InternetTime?.isSynced?.()) {
      renderDate(window.InternetTime.now(), `เวลาอินเทอร์เน็ต · ${window.InternetTime.source?.() || 'ซิงค์แล้ว'}`);
      return;
    }
    if (hasRtcTime && rtcEpochMs) {
      const elapsed = performance.now() - lastHeartbeatAt;
      const fresh = elapsed >= 0 && elapsed <= 30000;
      renderDate(new Date(rtcEpochMs + (fresh ? elapsed : 0)), fresh ? 'เวลา RTC ESP8266 · fallback' : 'RTC ล่าสุด · รอ heartbeat');
      return;
    }
    setText('[data-farm-time]', '--:--:--');
    setText('[data-farm-date]', internetError ? 'รอการเชื่อมต่อเพื่อซิงค์เวลา' : 'กำลังซิงค์เวลาจากอินเทอร์เน็ต');
    setText('[data-farm-clock-source]', internetError ? 'ยังไม่มีแหล่งเวลาที่เชื่อถือได้' : 'กำลังซิงค์เวลาอินเทอร์เน็ต');
  }

  function handleDeviceData(event) {
    const device = event.detail || {};
    const parsed = Date.parse(String(device.time || ''));
    const rtcAvailable = device.rtc === true || device.rtcValid === true;
    if (rtcAvailable && Number.isFinite(parsed)) {
      rtcEpochMs = parsed;
      lastHeartbeatAt = performance.now();
      hasRtcTime = true;
    } else if (device.rtc === false || device.rtcValid === false) {
      hasRtcTime = false;
      rtcEpochMs = 0;
      lastHeartbeatAt = 0;
    }
    render();
  }

  function bind() {
    window.addEventListener('device:data', handleDeviceData);
    window.addEventListener('esp:status', event => { if (!event.detail?.online) render(); });
    window.addEventListener('internet-time:updated', () => { internetError = false; render(); });
    window.addEventListener('internet-time:error', () => { internetError = true; render(); });
    render();
    window.setInterval(render, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
