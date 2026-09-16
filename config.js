const MQTT_BROKER = Object.freeze({
  protocol: 'wss:',
  host: '25305924f68c41f2a1e089a1836d3287.s1.eu.hivemq.cloud',
  port: 8884,
  path: '/mqtt'
});

const MQTT_ALLOWED_BROKER_HOSTS = Object.freeze([
  '25305924f68c41f2a1e089a1836d3287.s1.eu.hivemq.cloud'
]);

function buildMqttBrokerUrl(broker) {
  if (broker.protocol !== 'wss:' || broker.port !== 8884 || broker.path !== '/mqtt') {
    throw new Error('MQTT broker must use HiveMQ WSS on port 8884 and path /mqtt');
  }
  if (!MQTT_ALLOWED_BROKER_HOSTS.includes(broker.host)) {
    throw new Error('MQTT broker host is not allowlisted');
  }
  return `${broker.protocol}//${broker.host}:${broker.port}${broker.path}`;
}

const MQTT_CONFIG = Object.freeze({
  broker: MQTT_BROKER,
  url: buildMqttBrokerUrl(MQTT_BROKER),
  credentialSource: 'browser-storage',
  defaultUsername: 'smartfarm',
  clientId: `SmartFarmWeb-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`,
  topics: Object.freeze({
    relaySet: relay => `smartfarm/relay/${relay}/set`,
    relayStatus: relay => `smartfarm/relay/${relay}/status`,
    sensor: sensor => `smartfarm/sensor/${sensor}`,
    scheduleSet: relay => `smartfarm/schedule/${relay}/set`,
    scheduleStatus: relay => `smartfarm/schedule/${relay}/status`,
    online: 'smartfarm/status/online',
    deviceStatus: 'smartfarm/status/device',
    modeSet: 'smartfarm/mode/set',
    modeStatus: 'smartfarm/mode/status',
    time: 'smartfarm/time',
    error: 'smartfarm/system/error',
    telegramSet: 'smartfarm/config/telegram/set',
    telegramTest: 'smartfarm/config/telegram/test',
    telegramStatus: 'smartfarm/config/telegram/status',
    reminderSet: 'smartfarm/reminder/set',
    reminderStatus: 'smartfarm/reminder/status',
    aiAlertSet: 'smartfarm/ai/alert/set',
    aiAlertStatus: 'smartfarm/ai/alert/status',
    emergencySet: 'smartfarm/emergency/set',
    emergencyStatus: 'smartfarm/emergency/status'
  }),
  allowedSubscribeTopics: Object.freeze(['smartfarm/#']),
  deviceHeartbeatTimeoutMs: 25000
});

const HARDWARE_PINS = Object.freeze({
  DHT11_DATA: 'D2 / GPIO4',
  RTC_SDA: 'D3 / GPIO0',
  RTC_SCL: 'D4 / GPIO2',
  PUMP: 'D5 / GPIO14',
  ZONE1: 'D6 / GPIO12',
  HOME_LIGHT: 'D7 / GPIO13',
  SALA_LIGHT: 'D8 / GPIO15',
  SOIL_SENSOR: 'A0 / ADC0'
});

const RELAYS = Object.freeze(['pump', 'zone1', 'lighthome', 'lightsala']);
const RELAY_NAMES = Object.freeze({
  pump: 'ปั๊มน้ำ',
  zone1: 'โซน 1',
  lighthome: 'ไฟบ้าน',
  lightsala: 'ไฟศาลา'
});
const APP_STATE = {
  mqttConnected: false,
  espOnline: false,
  espLastSeen: 0,
  espStatusSource: 'none',
  relays: { pump: false, zone1: false, lighthome: false, lightsala: false },
  emergencyLock: false
};

window.MQTT_CONFIG = MQTT_CONFIG;
window.HARDWARE_PINS = HARDWARE_PINS;
window.RELAYS = RELAYS;
window.RELAY_NAMES = RELAY_NAMES;
window.APP_STATE = APP_STATE;

// Emergency control bridge. The firmware contract already exposes
// smartfarm/emergency/set with STOP / RESET payloads. Keep the UI control
// explicit so RESET is only available after an active emergency is confirmed.
(function installEmergencyDashboardControl() {
  const STYLE = `
    .emergency-control-panel{margin:18px 0;padding:18px;border:1px solid rgba(190,45,45,.22);border-radius:20px;background:linear-gradient(135deg,#fff8f8,#fff);box-shadow:0 8px 28px rgba(80,30,30,.08)}
    .emergency-control-panel.active{border-color:rgba(190,45,45,.48);box-shadow:0 10px 32px rgba(190,30,30,.14)}
    .emergency-control-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
    .emergency-control-title{display:flex;align-items:center;gap:10px;font-weight:800;font-size:18px}
    .emergency-control-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:#b42318;color:#fff;font-weight:900}
    .emergency-control-state{font-size:13px;font-weight:800;padding:7px 10px;border-radius:999px;background:#eef7ef;color:#24713b}
    .emergency-control-state.active{background:#fdecec;color:#b42318}
    .emergency-control-detail{margin:0 0 14px;color:#667085;font-size:14px}
    .emergency-control-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .emergency-control-actions button{min-height:48px;border:0;border-radius:14px;font:inherit;font-weight:800;cursor:pointer}
    .emergency-stop-button{background:#b42318;color:#fff}
    .emergency-reset-button{background:#eaf5ec;color:#216b36;border:1px solid #b9d8bf!important}
    .emergency-control-actions button:disabled{opacity:.45;cursor:not-allowed}
    @media(max-width:560px){.emergency-control-actions{grid-template-columns:1fr}.emergency-control-head{align-items:flex-start;flex-direction:column}}
  `;

  function addStyle() {
    if (document.getElementById('emergency-dashboard-style')) return;
    const style = document.createElement('style');
    style.id = 'emergency-dashboard-style';
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  function publish(payload) {
    const handler = window.mqttHandler;
    if (!handler?.publish || !window.MQTT_CONFIG?.topics?.emergencySet) {
      window.showToast?.('ยังไม่พบช่องทาง MQTT สำหรับหยุดฉุกเฉิน', 'error');
      return false;
    }
    if (!window.APP_STATE?.mqttConnected) {
      window.showToast?.('MQTT ยังไม่เชื่อมต่อ ไม่ส่งคำสั่งหยุดฉุกเฉิน', 'warning');
      handler.showSetup?.();
      return false;
    }
    const ok = handler.publish(window.MQTT_CONFIG.topics.emergencySet, payload);
    if (ok) window.showToast?.(payload === 'STOP' ? 'ส่งคำสั่งหยุดฉุกเฉินแล้ว · รอ ESP8266 ยืนยัน' : 'ส่งคำสั่งปลดล็อกแล้ว · รอ ESP8266 ยืนยัน', 'success');
    return ok;
  }

  function render(active, source = '') {
    const panel = document.querySelector('[data-emergency-panel]');
    if (!panel) return;
    panel.classList.toggle('active', Boolean(active));
    const state = panel.querySelector('[data-emergency-ui-state]');
    const detail = panel.querySelector('[data-emergency-ui-detail]');
    const stop = panel.querySelector('[data-emergency-stop]');
    const reset = panel.querySelector('[data-emergency-reset]');
    if (state) {
      state.textContent = active ? 'หยุดฉุกเฉิน ACTIVE' : 'ระบบปกติ';
      state.classList.toggle('active', Boolean(active));
    }
    if (detail) detail.textContent = active
      ? `รีเลย์ถูกล็อก · แหล่งคำสั่ง: ${source || 'อุปกรณ์'}`
      : 'หากเกิดเหตุฉุกเฉิน กด STOP เพื่อปิดรีเลย์ทั้งหมดทันที';
    if (stop) stop.disabled = Boolean(active);
    if (reset) reset.disabled = !active;
  }

  function mount() {
    if (document.querySelector('[data-emergency-panel]')) return;
    const anchor = document.querySelector('.dashboard-quick-actions');
    if (!anchor) return;
    addStyle();
    const panel = document.createElement('section');
    panel.className = 'emergency-control-panel';
    panel.dataset.emergencyPanel = '';
    panel.setAttribute('aria-labelledby', 'emergencyControlTitle');
    panel.innerHTML = `
      <div class="emergency-control-head">
        <div class="emergency-control-title"><span class="emergency-control-icon">!</span><span id="emergencyControlTitle">หยุดฉุกเฉิน</span></div>
        <span class="emergency-control-state" data-emergency-ui-state>ระบบปกติ</span>
      </div>
      <p class="emergency-control-detail" data-emergency-ui-detail>หากเกิดเหตุฉุกเฉิน กด STOP เพื่อปิดรีเลย์ทั้งหมดทันที</p>
      <div class="emergency-control-actions">
        <button class="emergency-stop-button" type="button" data-emergency-stop>STOP · หยุดฉุกเฉิน</button>
        <button class="emergency-reset-button" type="button" data-emergency-reset disabled>RESET · ปลดล็อก</button>
      </div>`;
    anchor.insertAdjacentElement('afterend', panel);

    panel.querySelector('[data-emergency-stop]').addEventListener('click', () => {
      if (window.APP_STATE?.emergencyLock) return;
      if (window.confirm('ยืนยันหยุดฉุกเฉิน? ระบบจะสั่งปิดรีเลย์ทั้งหมด')) publish('STOP');
    });
    panel.querySelector('[data-emergency-reset]').addEventListener('click', () => {
      if (!window.APP_STATE?.emergencyLock) return;
      if (window.confirm('ยืนยันปลดล็อกหยุดฉุกเฉิน? ระบบ AUTO อาจกลับมาทำงานตามตารางทันที')) publish('RESET');
    });
    render(Boolean(window.APP_STATE?.emergencyLock));
  }

  function boot() {
    mount();
    window.addEventListener('emergency:status', event => {
      const detail = event.detail || {};
      window.APP_STATE.emergencyLock = Boolean(detail.active);
      render(Boolean(detail.active), detail.source || '');
    });
    window.addEventListener('device:data', event => {
      const detail = event.detail || {};
      if (typeof detail.emergencyLock === 'boolean') render(detail.emergencyLock, detail.emergencySource || '');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();