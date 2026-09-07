(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
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
      const icon = document.createElement('b');
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = icons[type] || icons.info;
      const messageNode = document.createElement('span');
      messageNode.textContent = message;
      toast.append(icon, messageNode);
    stack.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4400);
  }

  function renderMqtt(connected, text) {
    const label = text || (connected ? 'MQTT เชื่อมต่อ' : 'MQTT ยังไม่เชื่อมต่อ');
    const detail = connected ? 'ช่องทางสั่งงานพร้อมใช้งาน' : (text || 'รอการเชื่อมต่อช่องทางสั่งงาน');
    $$('[data-mqtt-status]').forEach(element => {
      element.classList.toggle('online', Boolean(connected));
      element.classList.toggle('offline', !connected && !text);
      element.classList.toggle('warning', !connected && Boolean(text));
      const indicator = document.createElement('i');
      element.replaceChildren(indicator, document.createTextNode(label));
    });
    const panel = document.querySelector('[data-mqtt-live-panel]');
    if (panel) {
      panel.classList.toggle('online', Boolean(connected));
      panel.classList.toggle('offline', !connected && !text);
      panel.classList.toggle('warning', !connected && Boolean(text));
    }
    setText('mqttLiveLabel', label);
    setText('mqttLiveDetail', detail);
    setText('mqttLastUpdate', new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()));
    setText('mqttStatusText', connected ? 'เชื่อมต่อกับ HiveMQ Cloud แล้ว' : detail);
  }

  function renderDevice(online) {
    $$('[data-device-status]').forEach(element => {
      element.classList.toggle('online', Boolean(online));
      element.classList.toggle('offline', !online);
      const indicator = document.createElement('i');
      element.replaceChildren(indicator, document.createTextNode(`ESP8266 ${online ? 'ออนไลน์' : 'ออฟไลน์'}`));
    });
    $$('[data-device-online-text]').forEach(element => { element.textContent = online ? 'ออนไลน์' : 'ออฟไลน์'; });
    $$('[data-mqtt-device-status]').forEach(element => { element.textContent = online ? 'ออนไลน์ · heartbeat ล่าสุด' : 'ออฟไลน์ · รอ heartbeat'; });
    $$('[data-device-online-card]').forEach(card => card.classList.toggle('active', Boolean(online)));
  }

  function renderEmergency(active, source = '') {
    const label = active ? `EMERGENCY STOP ACTIVE${source ? ` · ${source}` : ''}` : 'Emergency Stop ปกติ';
    $$('[data-emergency-status]').forEach(element => {
      element.textContent = label;
      element.classList.toggle('danger', Boolean(active));
      element.classList.toggle('success', !active);
    });
    setText('systemEmergencyDetail', label);
  }

  function renderSensor(type, value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const suffix = type === 'temperature' ? ' °C' : ' %';
    const precision = type === 'temperature' ? 1 : 0;
    $$(`[data-sensor="${type}"]`).forEach(element => { element.textContent = `${numeric.toFixed(precision)}${suffix}`; });
  }

  function openMqttSetup() {
    const current = document.getElementById('mqttSetupModal');
    if (current) { current.remove(); return; }
    const credentials = window.mqttHandler?.getCredentials?.() || {};
    const overlay = document.createElement('div');
    overlay.id = 'mqttSetupModal';
    overlay.className = 'modal-overlay';
    const card = document.createElement('div');
    card.className = 'modal-card card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'mqttSetupTitle');
    const head = document.createElement('div');
    head.className = 'modal-head';
    const heading = document.createElement('div');
    const kicker = document.createElement('p');
    kicker.className = 'kicker';
    kicker.textContent = 'SECURE CONNECTION';
    const title = document.createElement('h2');
    title.id = 'mqttSetupTitle';
    title.textContent = 'ตั้งค่าการเชื่อมต่อ MQTT';
    heading.append(kicker, title);
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'btn ghost small';
    closeButton.dataset.closeMqtt = '';
    closeButton.setAttribute('aria-label', 'ปิด');
    closeButton.textContent = 'ปิด';
    head.append(heading, closeButton);
    const helper = document.createElement('p');
    helper.className = 'helper';
    helper.textContent = 'ข้อมูลจะเก็บไว้ในเบราว์เซอร์นี้เท่านั้น และไม่ถูกบันทึกในซอร์สโค้ด';
    const form = document.createElement('form');
    form.id = 'mqttSetupForm';
    form.className = 'form-grid modal-form';
    const field = (labelText, id, type, autocomplete) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'field full';
      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = labelText;
      const input = document.createElement('input');
      input.id = id;
      input.required = true;
      input.type = type;
      input.autocomplete = autocomplete;
      wrapper.append(label, input);
      return { wrapper, input };
    };
    const username = field('MQTT username', 'mqttUsername', 'text', 'username');
    const password = field('MQTT password', 'mqttPassword', 'password', 'current-password');
    const rememberLabel = document.createElement('label');
    rememberLabel.className = 'check-inline field full';
    const remember = document.createElement('input');
    remember.id = 'mqttRemember';
    remember.type = 'checkbox';
    remember.checked = Boolean(credentials.remember);
    const rememberText = document.createElement('span');
    rememberText.textContent = 'จดจำบนอุปกรณ์นี้';
    rememberLabel.append(remember, rememberText);
    const buttons = document.createElement('div');
    buttons.className = 'btn-row field full';
    const submit = document.createElement('button');
    submit.className = 'btn primary';
    submit.type = 'submit';
    submit.textContent = 'บันทึกและเชื่อมต่อ';
    const cancel = document.createElement('button');
    cancel.className = 'btn secondary';
    cancel.type = 'button';
    cancel.dataset.closeMqtt = '';
    cancel.textContent = 'ยกเลิก';
    buttons.append(submit, cancel);
    form.append(username.wrapper, password.wrapper, rememberLabel, buttons);
    card.append(head, helper, form);
    overlay.append(card);
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-close-mqtt]').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    form.addEventListener('submit', event => {
      event.preventDefault();
      try {
        window.mqttHandler.setCredentials(username.input.value, password.input.value, remember.checked);
        close();
        showToast('บันทึกบัญชี MQTT แล้ว กำลังเชื่อมต่อ', 'success');
      } catch (error) {
        showToast(error.message || 'ตั้งค่า MQTT ไม่สำเร็จ', 'error');
      }
    });
    username.input.focus();
  }

  function bindControls() {
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
    window.addEventListener('mqtt:reconnecting', event => {
      const delay = Number(event.detail?.delay) || 0;
      const suffix = delay > 0 ? `ใน ${Math.ceil(delay / 1000)} วินาที` : '';
      renderMqtt(false, `MQTT กำลังเชื่อมต่อใหม่${suffix}`);
    });
    window.addEventListener('mqtt:error', event => {
      const raw = event.detail?.message || String(event.detail || '');
      const detail = raw && raw !== '[object Object]' ? `: ${raw}` : '';
      renderMqtt(false, `MQTT เชื่อมต่อไม่สำเร็จ${detail}`);
    });
    window.addEventListener('esp:status', event => renderDevice(Boolean(event.detail?.online)));
    window.addEventListener('sensor:data', event => renderSensor(event.detail?.type, event.detail?.value));
    window.addEventListener('emergency:status', event => {
      const detail = event.detail || {};
      renderEmergency(Boolean(detail.active), String(detail.source || ''));
    });
    window.addEventListener('device:data', event => {
      const device = event.detail || {};
      if (device.firmware) setText('deviceFirmware', device.firmware);
      if (Number.isFinite(Number(device.rssi))) setText('deviceRssi', `${Number(device.rssi)} dBm`);
      if (typeof device.online === 'boolean') renderDevice(device.online);
      if (typeof device.emergencyLock === 'boolean') renderEmergency(device.emergencyLock, device.emergencySource || '');
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
    renderEmergency(Boolean(window.APP_STATE?.emergencyLock));
  }

  function boot() {
    bindControls();
    bindEvents();
    renderInitialState();
    window.mqttHandler?.bootstrap?.();
  }

  window.showToast = showToast;
  window.SmartFarmUI = { showToast, openMqttSetup };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
