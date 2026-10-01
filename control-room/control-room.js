(() => {
  'use strict';

  const config = window.SmartFarmDashboardConfig;
  const store = window.SmartFarmDashboardState;
  const mqtt = window.SmartFarmDashboardMqtt;
  const toastNode = document.querySelector('.toast');
  let toastTimer = 0;
  const $ = selector => document.querySelector(selector);
  const text = (selector, value) => { const node = $(selector); if (node) node.textContent = value; };
  const showToast = message => {
    if (!toastNode) return;
    toastNode.textContent = message;
    toastNode.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastNode.classList.remove('show'), 3000);
  };
  const mqttLabels = { connected: 'เชื่อมต่อแล้ว', connecting: 'กำลังเชื่อมต่อ', offline: 'ออฟไลน์', error: 'เกิดข้อผิดพลาด' };
  const statusLabel = value => value === null ? 'ยังไม่มีข้อมูล' : value ? 'ออนไลน์' : 'ออฟไลน์';
  const relayLabel = value => value === null ? 'ยังไม่มีข้อมูล' : value ? 'เปิด' : 'ปิด';
  const duration = value => {
    if (!Number.isFinite(Number(value))) return '—';
    const seconds = Math.max(0, Math.floor(Number(value)));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours ? `${hours} ชม. ${minutes} นาที` : minutes ? `${minutes} นาที ${seconds % 60} วินาที` : `${seconds} วินาที`;
  };
  const canReachDevice = state => state.mqtt.status === 'connected' && mqtt.client?.connected === true && state.esp.online === true;
  const controlReason = state => {
    if (state.esp.online === false) return 'ESP8266 ออฟไลน์ — ยังส่งคำสั่งไม่ได้';
    if (state.esp.online === null) return 'ยังไม่มี heartbeat จาก ESP8266 — ยังส่งคำสั่งไม่ได้';
    if (state.mqtt.status !== 'connected' || !mqtt.client?.connected) return 'MQTT ยังไม่เชื่อมต่อ — ยังส่งคำสั่งไม่ได้';
    return 'เชื่อมต่อแล้ว · คำสั่งจะแสดงผลเมื่อได้รับ status จาก ESP8266';
  };

  const render = state => {
    const mqttStatus = state.mqtt.status;
    const mqttNode = $('[data-control-mqtt-state]');
    if (mqttNode) {
      mqttNode.dataset.tone = mqttStatus === 'connected' ? 'good' : mqttStatus === 'error' ? 'bad' : 'warn';
      const label = mqttLabels[mqttStatus] || 'ออฟไลน์';
      const value = mqttNode.querySelector('span');
      if (value) value.textContent = `MQTT · ${label}`;
    }
    const espNode = $('[data-control-esp-state]');
    if (espNode) {
      const label = statusLabel(state.esp.online);
      espNode.dataset.tone = state.esp.online === null ? 'warn' : state.esp.online ? 'good' : 'bad';
      const value = espNode.querySelector('span');
      if (value) value.textContent = `ESP8266 · ${label}`;
    }
    text('[data-control-temperature]', state.sensor.temperature === null ? 'ยังไม่มีข้อมูล' : `${Number(state.sensor.temperature).toFixed(1)} °C`);
    text('[data-control-humidity]', state.sensor.humidity === null ? 'ยังไม่มีข้อมูล' : `${Number(state.sensor.humidity).toFixed(0)} %`);
    text('[data-control-esp-metric]', statusLabel(state.esp.online));
    text('[data-control-mode-metric]', state.mode || 'ยังไม่มีข้อมูล');
    text('[data-control-mode-status]', state.mode || 'ยังไม่มีข้อมูล');
    text('[data-control-firmware]', state.esp.firmware || '—');
    text('[data-control-uptime]', duration(state.esp.uptimeSec));
    text('[data-control-rssi]', state.esp.rssi === null ? '—' : `${state.esp.rssi} dBm`);
    text('[data-control-heap]', state.esp.heap === null ? '—' : `${state.esp.heap} B`);
    text('[data-control-heap-frag]', state.esp.heapFrag === null ? '—' : `${state.esp.heapFrag}%`);
    text('[data-control-reset-reason]', state.esp.resetReason || '—');
    text('[data-control-ip]', state.esp.ip || '—');
    text('[data-control-wifi]', state.esp.wifi === null ? '—' : state.esp.wifi ? 'เชื่อมต่อแล้ว' : 'ออฟไลน์');
    text('[data-control-device-mqtt]', state.esp.mqtt === null ? '—' : state.esp.mqtt ? 'เชื่อมต่อแล้ว' : 'ออฟไลน์');
    text('[data-control-ota]', state.esp.otaStatus || (state.esp.otaReady === null ? '—' : state.esp.otaReady ? 'READY' : 'DISABLED'));
    text('[data-control-emergency-status]', state.esp.emergencyLock === null ? 'ยังไม่มีข้อมูล' : state.esp.emergencyLock ? `หยุดฉุกเฉินทำงาน${state.esp.emergencySource ? ` · ${state.esp.emergencySource}` : ''}` : 'ปกติ');

    const connected = canReachDevice(state);
    const emergencyKnownAndReleased = state.esp.emergencyLock === false;
    const safePump = state.esp.pumpSafeLock === false;
    for (const relay of config.relays) {
      const value = state.relays[relay.id];
      const badge = $(`[data-control-relay-state="${relay.id}"]`);
      if (badge) {
        badge.textContent = relayLabel(value);
        badge.dataset.state = value === null ? 'unknown' : value ? 'on' : 'off';
      }
      document.querySelectorAll(`[data-relay="${relay.id}"]`).forEach(button => {
        const isOn = button.dataset.value === 'ON';
        button.disabled = !connected || (isOn && (!emergencyKnownAndReleased || (relay.id === 'pump' && !safePump)));
      });
    }
    for (const button of document.querySelectorAll('[data-control-mode]')) button.disabled = !connected;
    const emergencyStop = $('[data-control-emergency="STOP"]');
    const emergencyReset = $('[data-control-emergency="RESET"]');
    if (emergencyStop) emergencyStop.disabled = !connected || state.esp.emergencyLock !== false;
    if (emergencyReset) emergencyReset.disabled = !connected || state.esp.emergencyLock !== true;
    text('[data-control-interlock]', controlReason(state));
  };

  const publishCommand = (topic, payload, successMessage) => {
    const state = store.get();
    if (!canReachDevice(state)) {
      showToast(controlReason(state));
      return false;
    }
    const sent = mqtt.publish(topic, payload);
    if (sent) showToast(`${successMessage} · รอ status จาก ESP8266`);
    else showToast('ยังส่งคำสั่งไม่ได้ · ตรวจสอบ MQTT connection');
    return sent;
  };

  document.querySelectorAll('[data-relay][data-value]').forEach(button => button.addEventListener('click', () => {
    const relay = button.dataset.relay;
    const payload = button.dataset.value;
    const name = config.relays.find(item => item.id === relay)?.name || relay;
    if (payload === 'ON' && (store.get().esp.emergencyLock !== false || (relay === 'pump' && store.get().esp.pumpSafeLock !== false))) {
      showToast(relay === 'pump' && store.get().esp.pumpSafeLock === true ? 'ปั๊มถูกล็อกเพื่อความปลอดภัย' : 'ยังไม่มีสถานะความปลอดภัยจาก ESP8266');
      return;
    }
    if (!window.confirm(`ยืนยัน${payload === 'ON' ? 'เปิด' : 'ปิด'}${name}? ระบบจะรอ status ยืนยันจาก ESP8266`)) return;
    publishCommand(config.topics.relaySet(relay), payload, `${name}: ส่งคำสั่ง ${payload} แล้ว`);
  }));

  document.querySelectorAll('[data-control-mode]').forEach(button => button.addEventListener('click', () => {
    const mode = button.dataset.controlMode;
    publishCommand(config.topics.modeSet, mode, `ส่งคำสั่งโหมด ${mode} แล้ว`);
  }));

  document.querySelectorAll('[data-control-emergency]').forEach(button => button.addEventListener('click', () => {
    const command = button.dataset.controlEmergency;
    const prompt = command === 'STOP'
      ? 'ยืนยัน Emergency Stop? รีเลย์ทั้งหมดจะถูกสั่งปิดและล็อกการเปิด'
      : 'ยืนยันปลด Emergency Stop? ระบบ AUTO/Schedule อาจกลับมาควบคุมรีเลย์';
    if (!window.confirm(prompt)) return;
    publishCommand(config.topics.emergencySet, command, command === 'STOP' ? 'ส่งคำสั่งหยุดฉุกเฉินแล้ว' : 'ส่งคำสั่ง RESET แล้ว');
  }));

  window.addEventListener('smartfarm:mqtt:error', event => showToast(event.detail?.error || 'MQTT error'));
  window.addEventListener('smartfarm:mqtt:credentials-required', event => {
    if (event.detail?.reason === 'missing-credentials') showToast('กรุณาตั้งค่า MQTT credentials จากหน้า Dashboard > การเชื่อมต่อ');
  });
  store.subscribe(render);
  mqtt.bootstrap();
})();
