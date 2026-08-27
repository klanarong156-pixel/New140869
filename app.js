(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const relayLabel = relay => window.RELAY_NAMES?.[relay] || relay;
  const relayTimers = Object.create(null);
  const MAX_TIMER_MINUTES = 71582;
  const MAX_TIMER_SECONDS = MAX_TIMER_MINUTES * 60;

  function formatCountdown(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }

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
    $$('[data-mqtt-status]').forEach(element => {
      element.classList.toggle('online', Boolean(connected));
      element.classList.toggle('offline', !connected);
      element.classList.toggle('warning', !connected && Boolean(text));
      const label = text || (connected ? 'MQTT เชื่อมต่อ' : 'MQTT ยังไม่เชื่อมต่อ');
      const indicator = document.createElement('i');
      element.replaceChildren(indicator, document.createTextNode(label));
    });
    setText('mqttStatusText', text || (connected ? 'เชื่อมต่อกับ HiveMQ Cloud แล้ว' : 'ยังไม่ได้เชื่อมต่อ MQTT'));
  }

  function renderDevice(online) {
    $$('[data-device-status]').forEach(element => {
      element.classList.toggle('online', Boolean(online));
      element.classList.toggle('offline', !online);
      const indicator = document.createElement('i');
      element.replaceChildren(indicator, document.createTextNode(`ESP8266 ${online ? 'ออนไลน์' : 'ออฟไลน์'}`));
    });
    $$('[data-device-online-text]').forEach(element => { element.textContent = online ? 'ออนไลน์' : 'ออฟไลน์'; });
    $$('[data-device-online-card]').forEach(card => card.classList.toggle('active', Boolean(online)));
  }

  function renderRelay(relay, on) {
    $$(`[data-relay-toggle="${relay}"]`).forEach(input => { input.checked = Boolean(on); });
    $$(`[data-relay-state="${relay}"]`).forEach(element => { element.textContent = on ? 'กำลังทำงาน' : 'ปิดอยู่'; });
    $$(`[data-relay-card="${relay}"]`).forEach(card => card.classList.toggle('active', Boolean(on)));
  }

  function renderRelayTimer(relay, active, remaining, unlimited = false) {
    const seconds = Math.max(0, Math.floor(Number(remaining) || 0));
    if (relayTimers[relay]?.interval) window.clearInterval(relayTimers[relay].interval);
    if (!active) {
      delete relayTimers[relay];
      $$(`[data-timer-status="${relay}"]`).forEach(element => { element.textContent = 'ยังไม่ได้ตั้งเวลา'; });
      return;
    }
    if (unlimited) {
      delete relayTimers[relay];
      $$(`[data-timer-status="${relay}"]`).forEach(element => { element.textContent = 'เปิดไม่จำกัดเวลา'; });
      return;
    }
    if (seconds <= 0) {
      delete relayTimers[relay];
      $$(`[data-timer-status="${relay}"]`).forEach(element => { element.textContent = 'หมดเวลาแล้ว กำลังปิดรีเลย์'; });
      return;
    }
    const state = { remaining: seconds, interval: null };
    const paint = () => {
      const text = state.remaining > 0
        ? `ปิดอัตโนมัติใน ${formatCountdown(state.remaining)}`
        : 'หมดเวลาแล้ว กำลังปิดรีเลย์';
      $$(`[data-timer-status="${relay}"]`).forEach(element => { element.textContent = text; });
    };
    paint();
    state.interval = window.setInterval(() => {
      state.remaining -= 1;
      if (state.remaining <= 0) {
        window.clearInterval(state.interval);
        state.remaining = 0;
      }
      paint();
    }, 1000);
    relayTimers[relay] = state;
  }

  function commandRelayTimer(relay, seconds) {
    const handler = window.mqttHandler;
    const topic = window.MQTT_CONFIG?.topics?.relayTimerSet?.(relay);
    if (!handler?.publish || !topic) return false;
    const numericSeconds = Number(seconds);
    if (seconds !== 'UNLIMITED' && (!Number.isInteger(numericSeconds) || numericSeconds < 0 || numericSeconds > MAX_TIMER_SECONDS)) {
      showToast(`timer ต้องอยู่ระหว่าง 1–${MAX_TIMER_MINUTES.toLocaleString('th-TH')} นาที หรือเลือกไม่จำกัดเวลา`, 'warning');
      return false;
    }
    const payload = seconds === 'UNLIMITED' ? 'UNLIMITED' : String(numericSeconds);
    const sent = handler.publish(topic, payload);

    if (!sent) {
      showToast(window.APP_STATE?.mqttConnected ? 'ส่งคำสั่งไม่สำเร็จ กรุณาลองใหม่' : 'MQTT ยังไม่เชื่อมต่อ กรุณารอให้สถานะออนไลน์ก่อน', 'warning');
      if (!window.APP_STATE?.mqttConnected) handler.showSetup?.();
      return false;
    }
    if (seconds > 0 || seconds === 'UNLIMITED') renderRelay(relay, true);
    showToast(seconds > 0 || seconds === 'UNLIMITED' ? `${relayLabel(relay)}: เปิดแล้ว` : `${relayLabel(relay)}: ยกเลิกเวลาและปิดรีเลย์แล้ว`, 'success');
    return true;
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

  function commandRelay(relay, on) {
    const handler = window.mqttHandler;
    if (!handler?.publish || !window.MQTT_CONFIG?.topics) return false;
    if (on) {
      const input = document.querySelector(`[data-timer-minutes="${relay}"]`);
      const unlimited = document.querySelector(`[data-timer-unlimited="${relay}"]`)?.checked;
      const minutes = Number(input?.value);
      if (unlimited) {
        const sent = commandRelayTimer(relay, 'UNLIMITED');
        if (sent) renderRelay(relay, true);
        return sent;
      }
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_TIMER_MINUTES) {
        showToast('กรุณาตั้งเวลา 1–71,582 นาที หรือเลือกไม่จำกัดเวลา ก่อนกดเปิดรีเลย์', 'warning');
        return false;
      }
      const sent = commandRelayTimer(relay, minutes * 60);
      if (sent) renderRelay(relay, true);
      return sent;
    }
    const sent = handler.publish(MQTT_CONFIG.topics.relaySet(relay), 'OFF');
    if (!sent) {
      showToast(window.APP_STATE?.mqttConnected ? 'ส่งคำสั่งไม่สำเร็จ กรุณาลองใหม่' : 'MQTT ยังไม่เชื่อมต่อ กรุณารอให้สถานะออนไลน์ก่อน', 'warning');
      if (!window.APP_STATE?.mqttConnected) handler.showSetup();
      return false;
    }
    renderRelay(relay, false);
    showToast(`${relayLabel(relay)}: ส่งคำสั่งปิดแล้ว`, 'success');
    return true;
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
      if (document.querySelector(`[data-timer-unlimited="${relay}"]`)?.checked) {
        commandRelayTimer(relay, 'UNLIMITED');
        return;
      }
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_TIMER_MINUTES) {
        showToast('กรุณาตั้งเวลา 1–71,582 นาที หรือเลือกไม่จำกัดเวลา', 'warning');
        return;
      }
      commandRelayTimer(relay, minutes * 60);
    }));
    $$('[data-timer-cancel]').forEach(button => button.addEventListener('click', () => commandRelayTimer(button.dataset.timerCancel, 0)));
    $$('[data-timer-preset]').forEach(button => button.addEventListener('click', () => {
      const relay = button.dataset.timerFor;
      const input = document.querySelector(`[data-timer-minutes="${relay}"]`);
      if (!input) return;
      input.value = button.dataset.timerPreset;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      button.closest('.relay-timer')?.querySelectorAll('[data-timer-preset]').forEach(item => item.classList.toggle('active', item === button));
    }));

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
    window.addEventListener('relay:status', event => {
      const { relay, status } = event.detail || {};
      if (relay) renderRelay(relay, status);
    });
    window.addEventListener('relay:timer', event => {
      const { relay, active, unlimited, remaining } = event.detail || {};
      if (relay) renderRelayTimer(relay, active, remaining, unlimited);
    });
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
    Object.entries(window.APP_STATE?.relays || {}).forEach(([relay, on]) => renderRelay(relay, on));
  }

  function boot() {
    bindControls();
    bindEvents();
    renderInitialState();
    window.mqttHandler?.bootstrap?.();
  }

  window.showToast = showToast;
  window.SmartFarmUI = { showToast, openMqttSetup, commandRelay, commandRelayTimer };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
