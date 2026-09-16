(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const relayLabel = relay => window.RELAY_NAMES?.[relay] || relay;
  let deviceOnline = false;
  const relayFeedback = new Set();
  const relayPending = new Set();
  const relayPendingPrevious = new Map();

  function setText(target, value) {
    const element = typeof target === 'string' ? $(target) : target;
    if (element) element.textContent = value;
  }

  function renderDashboardReadiness() {
    const mqtt = Boolean(window.APP_STATE?.mqttConnected);
    const esp = Boolean(deviceOnline);
    const label = mqtt && esp ? 'พร้อมใช้งาน' : mqtt ? 'ESP ออฟไลน์' : 'MQTT ไม่เชื่อมต่อ';
    const detail = mqtt && esp
      ? 'อุปกรณ์ออนไลน์ ควบคุมได้ตามสถานะยืนยันจาก ESP8266'
      : mqtt
        ? 'MQTT เชื่อมต่ออยู่ แต่ยังไม่พบ heartbeat จาก ESP8266'
        : 'เชื่อมต่อ MQTT เพื่อดูสถานะจริงและสั่งงานอุปกรณ์';
    $$('[data-dashboard-readiness]').forEach(element => { element.textContent = label; });
    const header = document.querySelector('.dashboard-header-status');
    if (header) {
      header.dataset.state = mqtt && esp ? 'ready' : mqtt ? 'device-offline' : 'mqtt-offline';
      header.title = detail;
    }
    setText('[data-dashboard-notification-text]', detail);
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
    setText(document.querySelector('[data-mqtt-live-label]'), label);
    setText(document.querySelector('[data-mqtt-live-detail]'), detail);
    setText(document.querySelector('[data-mqtt-last-update]'), new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()));
    setText('mqttStatusText', connected ? 'เชื่อมต่อกับ HiveMQ Cloud แล้ว' : detail);
    $$('[data-system-mqtt]').forEach(element => {
      element.textContent = connected ? 'Connected' : (text ? 'กำลังเชื่อมต่อ' : 'Disconnected');
      element.dataset.state = connected ? 'online' : 'offline';
    });
    renderDashboardReadiness();
  }

  function renderDevice(online) {
    deviceOnline = Boolean(online);
    document.body?.classList.toggle('device-offline', !deviceOnline);
    $$('[data-device-status]').forEach(element => {
      element.classList.toggle('online', Boolean(online));
      element.classList.toggle('offline', !online);
      const indicator = document.createElement('i');
      element.replaceChildren(indicator, document.createTextNode(`ESP8266 ${online ? 'ออนไลน์' : 'ออฟไลน์'}`));
    });
    $$('[data-device-online-text]').forEach(element => { element.textContent = online ? 'ออนไลน์' : 'ออฟไลน์'; });
    $$('[data-mqtt-device-status]').forEach(element => { element.textContent = online ? 'ออนไลน์ · heartbeat ล่าสุด' : 'ออฟไลน์ · รอ heartbeat'; });
    $$('[data-system-esp]').forEach(element => {
      element.textContent = online ? 'Online' : 'Offline';
      element.dataset.state = online ? 'online' : 'offline';
    });
    if (!online) $$('[data-system-rtc]').forEach(element => { element.textContent = 'Last seen'; element.dataset.state = 'warning'; });
    $$('[data-sensor-freshness]').forEach(element => { element.textContent = online ? 'DHT11 · เรียลไทม์' : 'DHT11 · ค่าล่าสุดที่ได้รับ'; });
    $$('[data-device-online-card]').forEach(card => card.classList.toggle('active', Boolean(online)));
    renderDashboardReadiness();
    ['pump', 'zone1', 'lighthome', 'lightsala'].forEach(relay => {
      const input = document.querySelector(`[data-relay-toggle="${relay}"]`);
      if (input) renderRelay(relay, input.checked, relayFeedback.has(relay));
    });
  }

  function renderRelay(relay, on, hasFeedback = relayFeedback.has(relay)) {
    const emergencyLock = Boolean(window.APP_STATE?.emergencyLock);
    const pending = relayPending.has(relay);
    const unknown = !emergencyLock && !deviceOnline && !hasFeedback && !pending;
    const forcedOff = emergencyLock;
    const visibleOn = forcedOff ? false : Boolean(on);
    $$(`[data-relay-toggle="${relay}"]`).forEach(input => { input.checked = visibleOn; input.disabled = unknown || forcedOff; });
    const stateLabel = forcedOff ? 'หยุดฉุกเฉิน · ปิดอยู่' : unknown ? (window.APP_STATE?.mqttConnected ? 'รอข้อมูลจาก ESP8266' : 'ไม่ทราบสถานะ') : (visibleOn ? 'กำลังทำงาน' : 'ปิดอยู่');
    const actionLabel = forcedOff ? 'ล็อกโดย Emergency Stop' : unknown ? 'ควบคุมไม่ได้ขณะออฟไลน์' : (visibleOn ? `ON · หยุด${relayLabel(relay)}` : `OFF · เปิด${relayLabel(relay)}`);
    $$(`[data-relay-state="${relay}"]`).forEach(element => { element.textContent = stateLabel; });
    $$(`[data-relay-action-label="${relay}"]`).forEach(element => { element.textContent = actionLabel; });
    $$(`[data-relay-action="${relay}"]`).forEach(button => {
      button.disabled = unknown || forcedOff;
      button.classList.toggle('is-running', !unknown && !forcedOff && visibleOn);
      button.dataset.feedback = hasFeedback ? 'confirmed' : pending ? 'pending' : 'unknown';
      button.setAttribute('aria-label', forcedOff ? 'ถูกล็อกโดย Emergency Stop' : unknown ? 'ควบคุมไม่ได้ขณะออฟไลน์' : (visibleOn ? `สถานะ ON · กดเพื่อหยุด${relayLabel(relay)}` : `สถานะ OFF · กดเพื่อเปิด${relayLabel(relay)}`));
      const icon = button.querySelector('.context-action-icon');
      if (icon) icon.textContent = visibleOn ? '■' : '↗';
    });
    $$(`[data-relay-card="${relay}"]`).forEach(card => {
      card.classList.toggle('active', !unknown && !forcedOff && visibleOn);
      card.classList.toggle('device-unknown', unknown);
      card.classList.toggle('emergency-locked', forcedOff);
      card.classList.toggle('status-confirmed', hasFeedback);
      card.classList.toggle('status-pending', pending);
    });
  }

  function renderDashboardSchedule(relay, schedule) {
    if (relay !== 'pump') return;
    const list = document.querySelector('[data-dashboard-schedule-list]');
    if (!list) return;
    const slots = Array.isArray(schedule?.slots) ? schedule.slots : [];
    const enabled = slots.filter(slot => slot?.enabled && slot.on && slot.off && slot.on !== slot.off);
    list.replaceChildren();
    if (!enabled.length) {
      const empty = document.createElement('p');
      empty.className = 'schedule-empty';
      empty.textContent = 'ยังไม่มีข้อมูลตารางเวลาของปั๊มน้ำ';
      list.appendChild(empty);
      return;
    }
    enabled.slice(0, 4).forEach(slot => {
      const row = document.createElement('div');
      row.className = 'dashboard-schedule-row';
      const time = document.createElement('strong');
      time.textContent = `${slot.on} → ${slot.off}`;
      const label = document.createElement('span');
      label.textContent = 'ปั๊มน้ำ';
      row.append(time, label);
      list.appendChild(row);
    });
    $$('[data-dashboard-schedule-source]').forEach(element => { element.textContent = 'บันทึกใน ESP8266'; });
  }

  function renderEmergency(active, source = '') {
    if (window.APP_STATE) window.APP_STATE.emergencyLock = Boolean(active);
    if (active) relayPending.clear();
    const label = active ? `EMERGENCY STOP ACTIVE${source ? ` · ${source}` : ''}` : 'Emergency Stop ปกติ';
    $$('[data-emergency-panel]').forEach(panel => panel.classList.toggle('active', Boolean(active)));
    $$('[data-emergency-stop]').forEach(button => {
      button.disabled = Boolean(active);
      button.setAttribute('aria-disabled', String(Boolean(active)));
    });
    $$('[data-emergency-reset]').forEach(button => {
      button.disabled = !active;
      button.setAttribute('aria-disabled', String(!active));
    });
    $$('[data-emergency-status]').forEach(element => {
      element.textContent = label;
      element.classList.toggle('danger', Boolean(active));
      element.classList.toggle('success', !active);
    });
    setText('systemEmergencyDetail', label);
    ['pump', 'zone1', 'lighthome', 'lightsala'].forEach(relay => {
      renderRelay(relay, active ? false : Boolean(window.APP_STATE?.relays?.[relay]), relayFeedback.has(relay));
    });
  }

  function renderSensor(type, value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const suffix = type === 'temperature' ? ' °C' : ' %';
    const precision = type === 'temperature' ? 1 : 0;
    $$(`[data-sensor="${type}"]`).forEach(element => { element.textContent = `${numeric.toFixed(precision)}${suffix}`; });
    $$('[data-sensor-freshness]').forEach(element => { element.textContent = deviceOnline ? 'DHT11 · เรียลไทม์' : 'DHT11 · ค่าล่าสุดที่ได้รับ'; });
  }

  function commandRelay(relay, on) {
    if (window.APP_STATE?.emergencyLock) {
      showToast('Emergency Stop ทำงานอยู่ ต้อง RESET และรอ ESP8266 ยืนยันก่อน', 'warning');
      return false;
    }
    const handler = window.mqttHandler;
    if (!handler?.publish || !window.MQTT_CONFIG?.topics) return false;
    const state = on ? 'ON' : 'OFF';
    const sent = handler.publish(MQTT_CONFIG.topics.relaySet(relay), state);
    if (!sent) {
      showToast(window.APP_STATE?.mqttConnected ? 'ส่งคำสั่งไม่สำเร็จ กรุณาลองใหม่' : 'MQTT ยังไม่เชื่อมต่อ กรุณารอให้สถานะออนไลน์ก่อน', 'warning');
      if (!window.APP_STATE?.mqttConnected) handler.showSetup();
      return false;
    }
    relayPendingPrevious.set(relay, Boolean(window.APP_STATE?.relays?.[relay]));
    if (window.APP_STATE?.relays) window.APP_STATE.relays[relay] = on;
    relayPending.add(relay);
    renderRelay(relay, on, false);
    showToast(`${relayLabel(relay)}: ส่งคำสั่ง ${state} แล้ว · รออุปกรณ์ยืนยัน`, 'success');
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
    username.input.value = String(credentials.username || MQTT_CONFIG.defaultUsername || '').trim();
    username.input.placeholder = 'smartfarm';
    password.input.placeholder = 'กรอกรหัสผ่าน MQTT';
    const validation = document.createElement('p');
    validation.className = 'helper';
    validation.setAttribute('role', 'status');
    validation.setAttribute('aria-live', 'polite');
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
    form.append(username.wrapper, password.wrapper, validation, rememberLabel, buttons);
    card.append(head, helper, form);
    overlay.append(card);
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-close-mqtt]').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    const validate = () => {
      const cleanUser = username.input.value.trim();
      const cleanPass = password.input.value;
      const missing = [];
      if (!cleanUser) missing.push('username');
      if (!cleanPass) missing.push('password');
      submit.disabled = missing.length > 0;
      if (missing.length) {
        validation.textContent = `กรุณากรอก ${missing.join(' และ ')} ให้ครบก่อนบันทึก`;
        validation.className = 'helper error-text';
        return false;
      }
      validation.textContent = 'ข้อมูลครบถ้วน รหัสผ่านจะถูกเก็บไว้ใน Browser Storage เท่านั้น';
      validation.className = 'helper';
      return true;
    };
    [username.input, password.input].forEach(input => input.addEventListener('input', validate));
    validate();
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!validate()) {
        (username.input.value.trim() ? password.input : username.input).focus();
        return;
      }
      try {
        const started = window.mqttHandler.setCredentials(username.input.value, password.input.value, remember.checked);
        if (!started) {
          submit.disabled = false;
          validation.className = 'helper error-text';
          validation.textContent = 'เริ่มการเชื่อมต่อ MQTT ไม่สำเร็จ กรุณาตรวจสอบ library และลองใหม่';
          return;
        }
        submit.disabled = true;
        validation.className = 'helper';
        validation.textContent = 'บันทึกแล้ว กำลังตรวจสอบการเชื่อมต่อ MQTT… หน้านี้จะยังไม่ปิดจนกว่าจะเชื่อมต่อสำเร็จ';
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
    $$('[data-relay-action]').forEach(button => button.addEventListener('click', () => {
      const relay = button.dataset.relayAction;
      const input = document.querySelector(`[data-relay-toggle="${relay}"]`);
      if (!input) return;
      input.checked = !input.checked;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }));
    $$('[data-dashboard-notifications]').forEach(button => button.addEventListener('click', () => {
      const panel = document.getElementById('dashboardNotificationPanel');
      if (!panel) return;
      const open = panel.hidden;
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    }));
    $$('[data-dashboard-emergency-action]').forEach(link => link.addEventListener('click', event => {
      event.preventDefault();
      const panel = document.querySelector('[data-emergency-panel]');
      if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => document.querySelector('[data-emergency-stop]')?.focus(), 250);
      } else {
        window.farmTools?.emergencyStop?.();
      }
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
    window.addEventListener('mqtt:connected', event => {
      const connected = Boolean(event.detail);
      if (!connected) {
        relayFeedback.clear();
        renderDevice(false);
      }
      renderMqtt(connected);
      if (connected) document.getElementById('mqttSetupModal')?.remove();
    });
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
      const modal = document.getElementById('mqttSetupModal');
      if (modal) {
        const submit = modal.querySelector('#mqttSetupForm button[type="submit"]');
        const validation = modal.querySelector('[role="status"]');
        if (submit) submit.disabled = false;
        if (validation) {
          validation.className = 'helper error-text';
          validation.textContent = `เชื่อมต่อไม่สำเร็จ${detail} ตรวจสอบรหัสผ่านหรือสถานะ broker แล้วลองใหม่`;
        }
      }
    });
    window.addEventListener('mqtt:publish-error', event => {
      const topic = event.detail?.topic ? ` (${event.detail.topic})` : '';
      const error = event.detail?.error?.message || String(event.detail?.error || 'MQTT publish failed');
      const match = String(event.detail?.topic || '').match(/^smartfarm\/relay\/([^/]+)\/set$/);
      if (match && relayPending.has(match[1])) {
        const relay = match[1];
        relayPending.delete(relay);
        if (window.APP_STATE?.relays && relayPendingPrevious.has(relay)) window.APP_STATE.relays[relay] = relayPendingPrevious.get(relay);
        relayPendingPrevious.delete(relay);
        renderRelay(relay, Boolean(window.APP_STATE?.relays?.[relay]), relayFeedback.has(relay));
      }
      showToast(`ส่งข้อความ MQTT ไม่สำเร็จ${topic}: ${error}`, 'error');
    });
    window.addEventListener('mqtt:command-status', event => {
      const detail = event.detail || {};
      if (!detail.important) return;
      const labels = {
        queued: 'คำสั่งสำคัญรอการเชื่อมต่อ',
        pending: 'กำลังส่งคำสั่งสำคัญ · รอ broker ยืนยัน',
        acknowledged: 'ส่งคำสั่งสำคัญสำเร็จ · broker ยืนยันแล้ว',
        blocked: 'ยังไม่ส่งคำสั่ง · MQTT ยังไม่เชื่อมต่อ',
        error: `ส่งคำสั่งไม่สำเร็จ${detail.error ? ` · ${detail.error}` : ''}`
      };
      const element = document.querySelector('[data-mqtt-command-status]');
      if (element) {
        element.textContent = labels[detail.state] || 'สถานะคำสั่ง MQTT';
        element.dataset.state = detail.state || '';
      }
    });
    window.addEventListener('esp:status', event => renderDevice(Boolean(event.detail?.online)));
    window.addEventListener('relay:status', event => {
      const { relay, status } = event.detail || {};
      if (relay) {
        relayPending.delete(relay);
        relayPendingPrevious.delete(relay);
        relayFeedback.add(relay);
        renderRelay(relay, Boolean(status), true);
      }
    });
    window.addEventListener('schedule:status', event => {
      const { relay, schedule } = event.detail || {};
      if (relay) renderDashboardSchedule(relay, schedule);
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
      $$('[data-system-rtc]').forEach(element => {
        const ready = device.online !== false && (device.rtc === true || device.rtcValid === true);
        element.textContent = ready ? 'Ready' : (device.rtc === false || device.rtcValid === false ? 'Invalid' : 'Last seen');
        element.dataset.state = ready ? 'online' : 'warning';
      });
      if (typeof device.emergencyLock === 'boolean') renderEmergency(device.emergencyLock, device.emergencySource || '');
    });
    window.addEventListener('mqtt:credentials-required', event => {
      const status = event.detail?.status;
      if (status && !status.complete) {
        const missing = Array.isArray(status.missing) ? status.missing.join(' และ ') : 'username และ password';
        const storage = status.storage === 'localStorage' ? 'พื้นที่จัดเก็บแบบจดจำ' : status.storage === 'sessionStorage' ? 'เซสชันของเบราว์เซอร์' : 'การตั้งค่าในเบราว์เซอร์';
        setText('mqttStatusText', `ยังเชื่อมต่อไม่ได้: ขาด ${missing} ใน${storage}`);
      }
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
  window.SmartFarmUI = { showToast, openMqttSetup, commandRelay };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
