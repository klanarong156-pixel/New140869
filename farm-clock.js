(() => {
  'use strict';

  const dateFormatter = new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const timeFormatter = new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  let clockEpochMs = 0;
  let lastHeartbeatAt = 0;
  let hasClockTime = false;

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach(element => { element.textContent = value; });
  }

  function render() {
    if (!hasClockTime || !clockEpochMs) {
      setText('[data-farm-time]', '--:--:--');
      setText('[data-farm-date]', 'ยังไม่ได้รับเวลาจาก NTP');
      setText('[data-farm-clock-source]', 'รอ NTP จาก ESP8266');
      return;
    }
    const elapsed = performance.now() - lastHeartbeatAt;
    const fresh = elapsed >= 0 && elapsed <= 30000;
    const current = new Date(clockEpochMs + (fresh ? elapsed : 0));
    setText('[data-farm-time]', timeFormatter.format(current));
    setText('[data-farm-date]', dateFormatter.format(current));
    setText('[data-farm-clock-source]', fresh ? 'เวลา NTP ESP8266' : 'NTP ล่าสุด · รอ heartbeat');
  }

  function handleDeviceData(event) {
    const device = event.detail || {};
    const parsed = Date.parse(String(device.time || ''));
    const clockValid = device.clockValid === true || device.timeSource === 'ntp';
    if (clockValid && Number.isFinite(parsed)) {
      clockEpochMs = parsed;
      lastHeartbeatAt = performance.now();
      hasClockTime = true;
    } else if (device.clockValid === false || device.timeSource === 'unsynced') {
      hasClockTime = false;
      clockEpochMs = 0;
      lastHeartbeatAt = 0;
    }
    render();
  }

  function bind() {
    window.addEventListener('device:data', handleDeviceData);
    window.addEventListener('esp:status', event => {
      if (!event.detail?.online) render();
    });
    render();
    window.setInterval(render, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
