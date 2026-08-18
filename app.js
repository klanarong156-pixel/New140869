(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const relayLabel = relay => window.RELAY_NAMES?.[relay] || relay;

  function setText(target, value) {
    const element = typeof target === 'string' ? $(target) : target;
    if (element) element.textContent = value;
  }

  function showToast(message, type = 'info') {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    const icons = { success: '✓', warning: '!', error: '×', info: 'i' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<b aria-hidden="true">${icons[type] || icons.info}</b><span></span>`;
    toast.querySelector('span').textContent = message;
    stack.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4400);
  }

  function renderMqtt(connected, text) {
    $$('[data-mqtt-status]').forEach(element => {
      element.classList.toggle('online', Boolean(connected));
      element.classList.toggle('offline', !connected);
      element.classList.toggle('warning', !connected && Boolean(text));
      const label = text || (connected ? 'MQTT เชื่อมต่อ' : 'MQTT ยังไม่เชื่อมต่อ');
      element.innerHTML = `<i></i>${label}`;
    });
    setText('mqttStatusText', text || (connected ? 'เชื่อมต่อกับ HiveMQ Cloud แล้ว' : 'ยังไม่ได้เชื่อมต่อ MQTT'));
  }

  function renderDevice(online) {
    $$('[data-device-status]').forEach(element => {
      element.classList.toggle('online', Boolean(online));
      element.classList.toggle('offline', !online);
      element.innerHTML = `<i></i>ESP8266 ${online ? 'ออนไลน์' : 'ออฟไลน์'}`;
    });
    $$('[data-device-online-text]').forEach(element => { element.textContent = online ? 'ออนไลน์' : 'ออฟไลน์'; });
    $$('[data-device-online-card]').forEach(card => card.classList.toggle('active', Boolean(online)));
  }

  function renderMode(mode) {
    const normalized = String(mode || 'MANUAL').toUpperCase() === 'AUTO' ? 'AUTO' : 'MANUAL';
    $$('[data-mode-text]').forEach(element => { element.textContent = normalized; });
    $$('[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === normalized));
  }

  function renderRelay(relay, on) {
    $$(`[data-relay-toggle="${relay}"]`).forEach(input => { input.checked = Boolean(on); });
    $$(`[data-relay-state="${relay}"]`).forEach(element => { element.textContent = on ? 'กำลังทำงาน' : 'ปิดอยู่'; });
    $$(`[data-relay-card="${relay}"]`).forEach(card => card.classList.toggle('active', Boolean(on)));
  }

  function renderRelayTimer(relay, active, remaining) {
    const seconds = Math.max(0, Number(remaining) || 0);
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    const text = active && seconds > 0
      ? `ปิดอัตโนมัติใน ${minutes}:${String(rest).padStart(2, '0')} นาที`
      : 'ยังไม่ได้ตั้งเวลา';
    $$(`[data-timer-status="${relay}"]`).forEach(element => { element.textContent = text; });
  }

  function commandRelayTimer(relay, seconds) {
    const handler = window.mqttHandler;
    const topic = window.MQTT_CONFIG?.topics?.relayTimerSet?.(relay);
    if (!handler?.publish || !topic) return false;
    const sent = handler.publish(topic, String(Math.max(0, Math.floor(seconds))));
    if (!sent) {
      showToast('ต้องตั้งค่าบัญชี MQTT ก่อนตั้งเวลา', 'warning');
      handler.showSetup?.();
      return false;
    }
    showToast(seconds > 0 ? `${relayLabel(relay)}: เริ่มนับถอยหลังแล้ว` : `${relayLabel(relay)}: ยกเลิกเวลาปิดอัตโนมัติแล้ว`, 'success');
    return true;
  }

  function renderSensor(type, value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const suffix = type === 'temperature' ? ' °C' : ' %';
    const precision = type === 'temperature' ? 1 : 0;
    $$(`[data-sensor="${type}"]`).forEach(element => { element.textContent = `${numeric.toFixed(precision)}${suffix}`; });
  }

  function commandRelay(relay, on) {
    const handler = window.mqttHandler;
    if (!handler?.publish || !window.MQTT_CONFIG?.topics) return false;
    const sent = handler.publish(MQTT_CONFIG.topics.relaySet(relay), on ? 'ON' : 'OFF');
    if (!sent) {
      showToast('ต้องตั้งค่าบัญชี MQTT ก่อนส่งคำสั่ง', 'warning');
      handler.showSetup();
      return false;
    }
    renderRelay(relay, on);
    showToast(`${relayLabel(relay)}: ส่งคำสั่ง${on ? 'เปิด' : 'ปิด'}แล้ว`, 'success');
    return true;
  }

  function setFarmMode(mode) {
    const normalized = String(mode || '').toUpperCase();
    if (!['AUTO', 'MANUAL'].includes(normalized)) return false;
    if (normalized === 'AUTO' && window.SmartFarmWeather?.state?.autoWateringAllowed === false) {
      showToast(window.SmartFarmWeather.state.reason || 'สภาพอากาศยังไม่อนุญาตให้ใช้ AUTO', 'warning');
      return false;
    }
    const sent = window.mqttHandler?.publish?.(MQTT_CONFIG.topics.modeSet, normalized, { retain: false });
    if (!sent) {
      showToast('ต้องตั้งค่าบัญชี MQTT ก่อนเลือกโหมด', 'warning');
      window.mqttHandler?.showSetup();
      return false;
    }
    window.APP_STATE.mode = normalized.toLowerCase();
    renderMode(normalized);
    showToast(`เปลี่ยนโหมดเป็น ${normalized} แล้ว`, 'success');
    return true;
  }

  function openMqttSetup() {
    const current = document.getElementById('mqttSetupModal');
    if (current) { current.remove(); return; }
    const credentials = window.mqttHandler?.getCredentials?.() || {};
    const overlay = document.createElement('div');
    overlay.id = 'mqttSetupModal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card card" role="dialog" aria-modal="true" aria-labelledby="mqttSetupTitle">
        <div class="modal-head"><div><p class="kicker">SECURE CONNECTION</p><h2 id="mqttSetupTitle">ตั้งค่าการเชื่อมต่อ MQTT</h2></div><button type="button" class="btn ghost small" data-close-mqtt aria-label="ปิด">ปิด</button></div>
        <p class="helper">ข้อมูลจะเก็บไว้ในเบราว์เซอร์นี้เท่านั้น และไม่ถูกบันทึกในซอร์สโค้ด</p>
        <form id="mqttSetupForm" class="form-grid modal-form">
          <div class="field full"><label for="mqttUsername">MQTT username</label><input id="mqttUsername" required autocomplete="username" value=""></div>
          <div class="field full"><label for="mqttPassword">MQTT password</label><input id="mqttPassword" required type="password" autocomplete="current-password" value=""></div>
          <label class="check-inline field full"><input id="mqttRemember" type="checkbox" ${credentials.remember ? 'checked' : ''}><span>จดจำบนอุปกรณ์นี้</span></label>
          <div class="btn-row field full"><button class="btn primary" type="submit">บันทึกและเชื่อมต่อ</button><button class="btn secondary" type="button" data-close-mqtt>ยกเลิก</button></div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-close-mqtt]').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('#mqttSetupForm').addEventListener('submit', event => {
      event.preventDefault();
      try {
        const user = overlay.querySelector('#mqttUsername').value;
        const pass = overlay.querySelector('#mqttPassword').value;
        const remember = overlay.querySelector('#mqttRemember').checked;
        window.mqttHandler.setCredentials(user, pass, remember);
        close();
        showToast('บันทึกบัญชี MQTT แล้ว กำลังเชื่อมต่อ', 'success');
      } catch (error) {
        showToast(error.message || 'ตั้งค่า MQTT ไม่สำเร็จ', 'error');
      }
    });
    overlay.querySelector('#mqttUsername').focus();
  }

  function bindControls() {
    $$('[data-relay-toggle]').forEach(input => {
      input.addEventListener('change', () => {
        const relay = input.dataset.relayToggle;
        const accepted = commandRelay(relay, input.checked);
        if (!accepted) input.checked = !input.checked;
      });
    });
    $$('[data-timer-start]').forEach(button => button.addEventListener('click', () => {
      const relay = button.dataset.timerStart;
      const input = document.querySelector(`[data-timer-minutes="${relay}"]`);
      const minutes = Number(input?.value);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
        showToast('กรุณาตั้งเวลา 1–1440 นาที', 'warning');
        return;
      }
      commandRelayTimer(relay, minutes * 60);
    }));
    $$('[data-timer-cancel]').forEach(button => button.addEventListener('click', () => commandRelayTimer(button.dataset.timerCancel, 0)));

    $$('[data-mode]').forEach(button => button.addEventListener('click', () => setFarmMode(button.dataset.mode)));
    $$('[data-mqtt-connect]').forEach(button => button.addEventListener('click', () => {
      if (window.mqttHandler?.hasCredentials?.()) window.mqttHandler.connect();
      else openMqttSetup();
    }));
    $$('[data-mqtt-setup]').forEach(button => button.addEventListener('click', openMqttSetup));
    $$('[data-mqtt-clear]').forEach(button => button.addEventListener('click', () => {
      window.mqttHandler?.clearCredentials?.();
      showToast('ล้างบัญชี MQTT ออกจากเบราว์เซอร์แล้ว', 'success');
    }));
  }

  function bindEvents() {
    window.addEventListener('mqtt:connected', event => renderMqtt(Boolean(event.detail)));
    window.addEventListener('mqtt:connecting', () => renderMqtt(false, 'MQTT กำลังเชื่อมต่อ'));
    window.addEventListener('mqtt:reconnecting', () => renderMqtt(false, 'MQTT กำลังเชื่อมต่อใหม่'));
    window.addEventListener('mqtt:error', () => renderMqtt(false, 'MQTT เชื่อมต่อไม่สำเร็จ'));
    window.addEventListener('esp:status', event => renderDevice(Boolean(event.detail?.online)));
    window.addEventListener('mode:status', event => renderMode(event.detail));
    window.addEventListener('relay:status', event => {
      const { relay, status } = event.detail || {};
      if (relay) renderRelay(relay, status);
    });
    window.addEventListener('relay:timer', event => {
      const { relay, active, remaining } = event.detail || {};
      if (relay) renderRelayTimer(relay, active, remaining);
    });
    window.addEventListener('sensor:data', event => renderSensor(event.detail?.type, event.detail?.value));
    window.addEventListener('device:data', event => {
      const device = event.detail || {};
      if (device.firmware) setText('deviceFirmware', device.firmware);
      if (Number.isFinite(Number(device.rssi))) setText('deviceRssi', `${Number(device.rssi)} dBm`);
      if (device.mode) renderMode(device.mode);
      if (typeof device.online === 'boolean') renderDevice(device.online);
    });
    window.addEventListener('mqtt:credentials-required', event => {
      if (event.detail?.forPublish || event.detail?.manual) openMqttSetup();
    });
    window.addEventListener('access:ready', event => {
      const state = event.detail || {};
      $$('[data-operator-email]').forEach(element => { element.textContent = state.user?.email || 'ผู้ใช้งาน'; });
      $$('[data-operator-role]').forEach(element => { element.textContent = state.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งานฟาร์ม'; });
      $$('[data-admin-only]').forEach(element => element.classList.toggle('hidden', state.role !== 'admin'));
    });
  }

  function renderInitialState() {
    renderMqtt(Boolean(window.APP_STATE?.mqttConnected));
    renderDevice(Boolean(window.APP_STATE?.espOnline));
    renderMode(window.APP_STATE?.mode);
    Object.entries(window.APP_STATE?.relays || {}).forEach(([relay, on]) => renderRelay(relay, on));
  }

  function boot() {
    bindControls();
    bindEvents();
    renderInitialState();
    window.mqttHandler?.bootstrap?.();
  }

  window.showToast = showToast;
  window.setFarmMode = setFarmMode;
  window.SmartFarmUI = { showToast, openMqttSetup, commandRelay, commandRelayTimer, setFarmMode };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
