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
    if (!window.confirm('ปิดรีเลย์ทุกจุดและล็อกการเปิดซ้ำจนกว่าจะกดปลดล็อกหรือไม่?')) return false;
    const handler = window.mqttHandler;
    const topics = window.MQTT_CONFIG?.topics;
    if (!handler?.publish || !topics?.relaySet) {
      notify('ยังไม่เชื่อมต่อ MQTT จึงส่งคำสั่งหยุดไม่ได้', 'warning');
      handler?.showSetup?.();
      return false;
    }
    let sent = 0;
    if (topics.emergencySet) handler.publish(topics.emergencySet, 'EMERGENCY_STOP');
    RELAYS.forEach(relay => { if (handler.publish(topics.relaySet(relay), 'OFF')) sent += 1; });
    notify(sent === RELAYS.length ? 'หยุดและล็อกรีเลย์ทุกจุดแล้ว' : `ส่งคำสั่งหยุดแล้ว ${sent}/${RELAYS.length} จุด`, sent === RELAYS.length ? 'success' : 'warning');
    return sent > 0;
  }

  function resetEmergencyStop() {
    if (!window.confirm('ปลดล็อก Emergency Stop และอนุญาตให้ตาราง/คำสั่งเปิดรีเลย์อีกครั้งหรือไม่?')) return false;
    const handler = window.mqttHandler;
    const topic = window.MQTT_CONFIG?.topics?.emergencySet;
    if (!handler?.publish || !topic) {
      notify('ระบบรุ่นนี้ยังไม่รองรับการปลดล็อก Emergency Stop ผ่าน MQTT', 'warning');
      return false;
    }
    const sent = handler.publish(topic, 'EMERGENCY_RESET');
    notify(sent ? 'ส่งคำสั่งปลดล็อกแล้ว ระบบจะกลับตามตารางเมื่อได้รับคำยืนยันจาก ESP8266' : 'ส่งคำสั่งปลดล็อกไม่สำเร็จ', sent ? 'success' : 'warning');
    return sent;
  }

  function installPumpAnimation() {
    const card = document.querySelector('[data-relay-card="pump"]');
    if (!card || card.querySelector('[data-pump-animation]')) return;

    const style = document.createElement('style');
    style.dataset.pumpAnimationStyle = 'true';
    style.textContent = `
      [data-pump-animation] {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 112px;
        margin: 12px 0;
        overflow: hidden;
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(39, 125, 197, .08), rgba(39, 125, 197, .18));
        border: 1px solid rgba(39, 125, 197, .16);
      }
      [data-pump-animation] svg { width: min(100%, 330px); height: 108px; display: block; }
      [data-pump-animation] .pump-body { transform-origin: 96px 57px; }
      [data-pump-animation] .pump-shine { opacity: .35; }
      [data-pump-animation] .water-flow { stroke-dasharray: 9 8; stroke-dashoffset: 0; opacity: .28; }
      [data-pump-animation] .water-drop { opacity: .35; transform: translateY(-5px); }
      [data-pump-animation] .flow-label { font: 700 11px system-ui, sans-serif; fill: currentColor; opacity: .58; }
      [data-relay-card="pump"].active [data-pump-animation] .water-flow { animation: smartFarmWaterFlow .7s linear infinite; opacity: 1; }
      [data-relay-card="pump"].active [data-pump-animation] .water-drop { animation: smartFarmWaterDrop 1.35s ease-in infinite; }
      [data-relay-card="pump"].active [data-pump-animation] .pump-body { animation: smartFarmPumpPulse .42s ease-in-out infinite alternate; }
      [data-relay-card="pump"].active [data-pump-animation] .pump-shine { animation: smartFarmPumpShine 1.2s ease-in-out infinite; }
      @keyframes smartFarmWaterFlow { to { stroke-dashoffset: -34; } }
      @keyframes smartFarmWaterDrop { 0% { opacity: 0; transform: translateY(-9px); } 18% { opacity: 1; } 100% { opacity: 0; transform: translateY(34px); } }
      @keyframes smartFarmPumpPulse { from { transform: rotate(-.6deg) scale(1); } to { transform: rotate(.6deg) scale(1.012); } }
      @keyframes smartFarmPumpShine { 0%, 100% { opacity: .25; } 50% { opacity: .65; } }
      @media (prefers-reduced-motion: reduce) {
        [data-pump-animation] * { animation: none !important; }
      }
    `;
    if (!document.querySelector('[data-pump-animation-style]')) {
      document.head.appendChild(style);
    }

    const animation = document.createElement('div');
    animation.dataset.pumpAnimation = '';
    animation.setAttribute('role', 'img');
    animation.setAttribute('aria-label', 'ภาพเคลื่อนไหวปั๊มน้ำและน้ำไหล');
    animation.innerHTML = `
      <svg viewBox="0 0 330 108" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="sfPumpMetal" x1="0" x2="1">
            <stop offset="0" stop-opacity=".7"/><stop offset=".5"/><stop offset="1" stop-opacity=".7"/>
          </linearGradient>
          <linearGradient id="sfWater" x1="0" x2="1">
            <stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#0284c7"/>
          </linearGradient>
        </defs>
        <g class="pump-body">
          <rect x="45" y="38" width="102" height="38" rx="11" fill="url(#sfPumpMetal)" stroke="currentColor" stroke-opacity=".24"/>
          <circle cx="49" cy="57" r="17" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="7"/>
          <circle cx="49" cy="57" r="7" fill="currentColor" fill-opacity=".22"/>
          <rect x="67" y="29" width="56" height="9" rx="4" fill="currentColor" fill-opacity=".14"/>
          <rect x="73" y="76" width="18" height="7" rx="2" fill="currentColor" fill-opacity=".22"/>
          <rect x="111" y="76" width="18" height="7" rx="2" fill="currentColor" fill-opacity=".22"/>
          <path class="pump-shine" d="M82 43h42" stroke="white" stroke-width="3" stroke-linecap="round"/>
        </g>
        <path d="M145 57 C175 57 178 30 204 30 H308" fill="none" stroke="#94a3b8" stroke-width="14" stroke-linecap="round"/>
        <path d="M145 57 C175 57 178 30 204 30 H308" fill="none" stroke="url(#sfWater)" stroke-width="8" stroke-linecap="round" class="water-flow"/>
        <circle class="water-drop" cx="239" cy="30" r="4" fill="#38bdf8"/>
        <circle class="water-drop" cx="275" cy="30" r="3" fill="#38bdf8" style="animation-delay:.35s"/>
        <path d="M307 30v45" fill="none" stroke="#94a3b8" stroke-width="14" stroke-linecap="round"/>
        <path d="M307 30v45" fill="none" stroke="url(#sfWater)" stroke-width="8" stroke-linecap="round" class="water-flow"/>
        <path d="M294 75h26" stroke="currentColor" stroke-opacity=".2" stroke-width="4" stroke-linecap="round"/>
        <text x="164" y="94" class="flow-label">WATER FLOW · PUMP</text>
      </svg>
    `;
    const controlAction = card.querySelector('.context-action');
    if (controlAction) controlAction.insertAdjacentElement('beforebegin', animation);
    else card.appendChild(animation);
  }

  function bind() {
    renderMode();
    installPumpAnimation();
    document.querySelectorAll('[data-ui-mode-toggle]').forEach(button => button.addEventListener('click', toggleMode));
    document.querySelectorAll('[data-system-export]').forEach(button => button.addEventListener('click', exportAll));
    document.querySelectorAll('[data-system-import]').forEach(input => input.addEventListener('change', event => importAll(event.target.files?.[0])));
    document.querySelectorAll('[data-emergency-stop]').forEach(button => button.addEventListener('click', emergencyStop));
    document.querySelectorAll('[data-emergency-reset]').forEach(button => button.addEventListener('click', resetEmergencyStop));
    window.farmTools = { exportAll, importAll, emergencyStop, resetEmergencyStop, getMode, renderMode };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
