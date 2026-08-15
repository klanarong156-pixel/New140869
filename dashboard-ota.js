(() => {
  'use strict';

  const form = document.getElementById('otaDashboardForm');
  if (!form) return;

  const deviceUrl = document.getElementById('otaDeviceUrl');
  const password = document.getElementById('otaPassword');
  const firmware = document.getElementById('otaFirmwareFile');
  const progress = document.getElementById('otaDashboardProgress');
  const status = document.getElementById('otaDashboardStatus');
  const statusText = status?.querySelector('span:last-child');
  const savedUrl = localStorage.getItem('smartfarm_ota_device_url') || '';
  if (savedUrl) deviceUrl.value = savedUrl;

  const setStatus = (message, kind = '') => {
    if (statusText) statusText.textContent = message;
    status.className = `notice ${kind}`.trim();
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const file = firmware.files?.[0];
    const baseUrl = deviceUrl.value.trim().replace(/\/+$/, '');
    if (!file || !baseUrl || !password.value) {
      setStatus('กรุณากรอก URL รหัสผ่าน และเลือกไฟล์ .bin ให้ครบ', 'warning');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.bin')) {
      setStatus('ไฟล์ต้องเป็นเฟิร์มแวร์นามสกุล .bin เท่านั้น', 'warning');
      return;
    }

    localStorage.setItem('smartfarm_ota_device_url', baseUrl);
    const payload = new FormData();
    payload.append('firmware', file, file.name);
    const request = new XMLHttpRequest();
    request.open('POST', `${baseUrl}/update`);
    request.setRequestHeader('Authorization', `Basic ${btoa(`admin:${password.value}`)}`);
    request.upload.addEventListener('progress', (progressEvent) => {
      if (!progressEvent.lengthComputable) return;
      progress.value = Math.round((progressEvent.loaded / progressEvent.total) * 100);
      setStatus(`กำลังอัปโหลด ${progress.value}%`);
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        progress.value = 100;
        setStatus('อัปเดตสำเร็จ อุปกรณ์กำลังรีสตาร์ต และจะแจ้งผลผ่าน Telegram', 'success');
      } else {
        setStatus(`อัปเดตไม่สำเร็จ (${request.status}): ${request.responseText || 'ไม่ทราบสาเหตุ'}`, 'warning');
      }
    });
    request.addEventListener('error', () => setStatus('เชื่อมต่อ ESP8266 ไม่ได้ ตรวจสอบ Wi‑Fi และ URL ของอุปกรณ์', 'warning'));
    request.addEventListener('abort', () => setStatus('ยกเลิกการอัปโหลดแล้ว', 'warning'));
    progress.value = 0;
    setStatus('กำลังเตรียมอัปโหลดเฟิร์มแวร์...');
    request.send(payload);
  });
})();
