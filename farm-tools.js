(() => {
  'use strict';

  const UI_MODE_KEY = 'smartfarm.ui.mode';
  const RELAYS = ['pump', 'zone1', 'lighthome', 'lightsala'];
  const SECRET_KEY = /pass|token|secret|credential/i;
  const $ = id => document.getElementById(id);

  function notify(message, type = 'info') {
    window.showToast?.(message, type);
  }

  function getMode() {
    return localStorage.getItem(UI_MODE_KEY) === 'advanced' ? 'advanced' : 'simple';
  }

  function renderMode() {
    const mode = getMode();
    document.body.classList.toggle('simple-mode', mode === 'simple');
    document.body.dataset.uiMode = mode;
    document.querySelectorAll('[data-ui-mode-toggle]').forEach(button => {
      button.textContent = mode === 'simple' ? 'แสดงขั้นสูง' : 'โหมดง่าย';
      button.setAttribute('aria-pressed', String(mode === 'advanced'));
    });
    document.querySelectorAll('[data-ui-mode-label]').forEach(element => {
      element.textContent = mode === 'simple' ? 'โหมดใช้งานง่าย' : 'โหมดขั้นสูง';
    });
  }

  function toggleMode() {
    localStorage.setItem(UI_MODE_KEY, getMode() === 'simple' ? 'advanced' : 'simple');
    renderMode();
    notify(getMode() === 'simple' ? 'เปิดโหมดใช้งานง่ายแล้ว' : 'เปิดโหมดขั้นสูงแล้ว', 'success');
  }

  function safeStorage() {
    const storage = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith('smartfarm.') || SECRET_KEY.test(key)) continue;
      storage[key] = localStorage.getItem(key);
    }
    return storage;
  }

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function exportAll() {
    const analytics = window.farmAnalytics?.get?.() || null;
    const data = {
      schemaVersion: 2,
      app: 'Suan Lung Na Smart Farm',
      exportedAt: new Date().toISOString(),
      storage: safeStorage(),
      cropCycle: window.cropCycle?.get?.() || null,
      cropReminders: window.cropReminders?.get?.() || null,
      cropPlots: window.cropPlots?.get?.() || [],
      analytics
    };
    downloadJson(data, `smartfarm-backup-${new Date().toISOString().slice(0, 10)}.json`);
    notify('ส่งออกข้อมูลสำรองแล้ว โดยไม่รวมรหัสลับ', 'success');
  }

  function importAll(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(String(reader.result || ''));
        if (!data || typeof data !== 'object' || !data.storage || Number(data.schemaVersion) < 1) throw new Error('รูปแบบไฟล์สำรองไม่ถูกต้อง');
        Object.entries(data.storage).forEach(([key, value]) => {
          if (key.startsWith('smartfarm.') && !SECRET_KEY.test(key) && typeof value === 'string') localStorage.setItem(key, value);
        });
        if (window.FirebaseDB && window.FirebaseAuth?.user) {
          const uploads = [];
          if (data.cropCycle) uploads.push(FirebaseDB.put('farm/cropCycle', data.cropCycle));
          if (Array.isArray(data.cropReminders?.items)) uploads.push(FirebaseDB.put('farm/cropReminders', data.cropReminders));
          if (Array.isArray(data.cropPlots)) uploads.push(FirebaseDB.put('farm/cropPlots', data.cropPlots));
          if (data.analytics) uploads.push(FirebaseDB.put('farm/analytics', data.analytics));
          await Promise.all(uploads);
        }
        notify('นำเข้าข้อมูลสำรองแล้ว กำลังโหลดหน้าใหม่', 'success');
        window.setTimeout(() => window.location.reload(), 500);
      } catch (error) {
        notify(error.message || 'นำเข้าข้อมูลสำรองไม่สำเร็จ', 'error');
      }
    };
    reader.onerror = () => notify('อ่านไฟล์สำรองไม่สำเร็จ', 'error');
    reader.readAsText(file);
  }

  function emergencyStop() {
    if (!window.confirm('ปิดรีเลย์ทุกจุดทันทีหรือไม่?')) return false;
    const handler = window.mqttHandler;
    const topics = window.MQTT_CONFIG?.topics;
    if (!handler?.publish || !topics?.relaySet) {
      notify('ยังไม่เชื่อมต่อ MQTT จึงส่งคำสั่งหยุดไม่ได้', 'warning');
      handler?.showSetup?.();
      return false;
    }
    let sent = 0;
    RELAYS.forEach(relay => { if (handler.publish(topics.relaySet(relay), 'OFF')) sent += 1; });
    notify(sent === RELAYS.length ? 'ส่งคำสั่งหยุดรีเลย์ทุกจุดแล้ว' : `ส่งคำสั่งหยุดแล้ว ${sent}/${RELAYS.length} จุด`, sent === RELAYS.length ? 'success' : 'warning');
    return sent > 0;
  }

  function bind() {
    renderMode();
    document.querySelectorAll('[data-ui-mode-toggle]').forEach(button => button.addEventListener('click', toggleMode));
    document.querySelectorAll('[data-system-export]').forEach(button => button.addEventListener('click', exportAll));
    document.querySelectorAll('[data-system-import]').forEach(input => input.addEventListener('change', event => importAll(event.target.files?.[0])));
    document.querySelectorAll('[data-emergency-stop]').forEach(button => button.addEventListener('click', emergencyStop));
    window.farmTools = { exportAll, importAll, emergencyStop, getMode, renderMode };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
