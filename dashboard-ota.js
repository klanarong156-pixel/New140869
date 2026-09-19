(() => {
  'use strict';

  let initialized = false;

  function init(access) {
    if (initialized || access?.role !== 'admin') return;
    initialized = true;

    const form = document.getElementById('otaDashboardForm');
    if (!form) return;
    const deviceUrl = document.getElementById('otaDeviceUrl');
    const password = document.getElementById('otaPassword');
    const firmware = document.getElementById('otaFirmwareFile');
    const progress = document.getElementById('otaDashboardProgress');
    const status = document.getElementById('otaDashboardStatus');
    const statusText = status?.querySelector('span:last-child');
    const testButton = document.getElementById('otaDashboardTest');
    const submitButton = form.querySelector('button[type="submit"]');
    const savedUrl = sessionStorage.getItem('smartfarm_ota_device_url') || '';
    if (savedUrl) deviceUrl.value = savedUrl;

    const setStatus = (message, kind = '') => {
      if (statusText) statusText.textContent = message;
      if (status) status.className = `notice ${kind}`.trim();
    };
    const getBaseUrl = () => {
      const baseUrl = deviceUrl.value.trim().replace(/\/+$/, '');
      if (!/^https:\/\//i.test(baseUrl)) {
        throw new Error('OTA ในหน้า Dashboard ต้องผ่าน HTTPS gateway/VPN เท่านั้น ห้ามส่งรหัสผ่านผ่าน http://');
      }
      return baseUrl;
    };
    const getAuth = () => {
      if (!password.value) throw new Error('กรุณากรอกรหัสผ่าน OTA');
      return `Basic ${btoa(`admin:${password.value}`)}`;
    };
    const setBusy = busy => {
      [testButton, submitButton].forEach(button => { if (button) button.disabled = busy; });
    };
    [testButton, submitButton].forEach(button => {
      if (button) {
        button.disabled = false;
        button.setAttribute('aria-disabled', 'false');
      }
    });
    const fetchWithTimeout = (url, options = {}, timeoutMs = 10000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
    };

    testButton?.addEventListener('click', async () => {
      setBusy(true);
      try {
        const baseUrl = getBaseUrl();
        const response = await fetchWithTimeout(`${baseUrl}/api/status`, {
          headers: { Authorization: getAuth() }, credentials: 'omit', cache: 'no-store'
        });
        const responseText = await response.text();
        if (!response.ok) throw new Error(`HTTP ${response.status}${responseText ? ` · ${responseText}` : ''}`);
        let device = {};
        try { device = JSON.parse(responseText); } catch (_) { /* reachable without JSON */ }
        setStatus(`เชื่อมต่อ ESP8266 สำเร็จ · firmware ${device.firmware || 'ไม่ระบุ'} · RSSI ${device.rssi ?? 'ไม่ระบุ'}`, 'success');
      } catch (error) {
        setStatus(error.name === 'AbortError' ? 'ตรวจการเชื่อมต่อเกินเวลา' : (error.message || 'ตรวจการเชื่อมต่อไม่สำเร็จ'), 'warning');
      } finally { setBusy(false); }
    });

    form.addEventListener('submit', event => {
      event.preventDefault();
      const file = firmware.files?.[0];
      let baseUrl;
      try { baseUrl = getBaseUrl(); } catch (error) { setStatus(error.message, 'warning'); return; }
      if (!file || !password.value) {
        setStatus('กรุณากรอก URL รหัสผ่าน และเลือกไฟล์ .bin ให้ครบ', 'warning');
        return;
      }
      if (!file.name.toLowerCase().endsWith('.bin')) {
        setStatus('ไฟล์ต้องเป็นเฟิร์มแวร์นามสกุล .bin เท่านั้น', 'warning');
        return;
      }

      sessionStorage.setItem('smartfarm_ota_device_url', baseUrl);
      const payload = new FormData();
      payload.append('firmware', file, file.name);
      const request = new XMLHttpRequest();
      request.open('POST', `${baseUrl}/update`);
      request.timeout = 120000;
      request.setRequestHeader('Authorization', getAuth());
      setBusy(true);
      progress.value = 0;
      setStatus('กำลังเตรียมอัปโหลดเฟิร์มแวร์...');
      request.upload.addEventListener('progress', event => {
        if (!event.lengthComputable) return;
        progress.value = Math.round((event.loaded / event.total) * 100);
        setStatus(`กำลังอัปโหลด ${progress.value}%`);
      });
      request.addEventListener('load', () => {
        if (request.status >= 200 && request.status < 300) {
          progress.value = 100;
          setStatus('ส่ง firmware สำเร็จ อุปกรณ์กำลังรีสตาร์ต โปรดตรวจ boot/MQTT/relay หลัง 30–90 วินาที', 'success');
        } else setStatus(`อัปเดตไม่สำเร็จ (${request.status}): ${request.responseText || 'ไม่ทราบสาเหตุ'}`, 'warning');
        setBusy(false);
      });
      request.addEventListener('timeout', () => { setStatus('อัปโหลดเกินเวลา โปรดตรวจสถานะอุปกรณ์ก่อนลองซ้ำ', 'warning'); setBusy(false); });
      request.addEventListener('error', () => { setStatus('เชื่อมต่อ OTA gateway ไม่ได้', 'warning'); setBusy(false); });
      request.addEventListener('abort', () => { setStatus('ยกเลิกการอัปโหลดแล้ว โปรดตรวจ boot ก่อนใช้งาน', 'warning'); setBusy(false); });
      request.send(payload);
    });
  }

  function onAccessReady(event) {
    const access = event.detail || {};
    if (access.role === 'admin') init(access);
    else document.getElementById('otaDashboardStatus')?.querySelector('span:last-child')?.replaceChildren(
      document.createTextNode('ต้องมีสิทธิ์ผู้ดูแลระบบจึงจะใช้ OTA ได้')
    );
  }

  window.addEventListener('access:ready', onAccessReady, { once: true });
  if (window.SMARTFARM_ACCESS?.ready) onAccessReady({ detail: window.SMARTFARM_ACCESS });
})();

/* OTA security contract:
 * - ESP8266 HTTP Basic Auth is disabled by default in firmware.
 * - This page accepts only an HTTPS gateway/VPN endpoint.
 * - The gateway must enforce admin identity, device allowlist, firmware
 *   signature/checksum, audit logging, rate limits, and post-reboot checks.
 */
