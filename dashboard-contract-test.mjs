import fs from 'node:fs';
import vm from 'node:vm';

const events = [];
const listeners = new Map();
const storage = new Map([
  ['smartfarm.dashboard.username', 'smartfarm'],
  ['smartfarm.dashboard.password', 'test-password']
]);
const session = new Map();
const localStorage = {
  getItem(key) { return storage.get(key) || null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); }
};
const sessionStorage = {
  getItem(key) { return session.get(key) || null; },
  setItem(key, value) { session.set(key, String(value)); },
  removeItem(key) { session.delete(key); }
};

class FakeClient {
  constructor() {
    this.handlers = new Map();
    this.connected = false;
    this.published = [];
    this.subscriptions = [];
  }
  on(name, handler) { this.handlers.set(name, handler); return this; }
  emit(name, ...args) {
    if (name === 'connect') this.connected = true;
    if (name === 'close' || name === 'offline') this.connected = false;
    this.handlers.get(name)?.(...args);
  }
  subscribe(topic, options, callback) { this.subscriptions.push({ topic, options }); callback?.(); }
  publish(topic, payload, options, callback) { this.published.push({ topic, payload, options }); callback?.(); }
  end() { this.connected = false; }
}

let fakeClient;
const context = {
  console,
  Date,
  JSON,
  Number,
  String,
  Boolean,
  Object,
  Array,
  Map,
  Set,
  URLSearchParams,
  crypto: { getRandomValues: array => { array[0] = 1234; return array; } },
  window: {
    dispatchEvent(event) { events.push(event); (listeners.get(event.type) || []).forEach(listener => listener(event)); },
    addEventListener(name, listener) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(listener); },
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout,
    clearTimeout,
    localStorage,
    sessionStorage,
    mqtt: {
      connect() { fakeClient = new FakeClient(); return fakeClient; }
    }
  }
};
context.CustomEvent = context.window.CustomEvent;
context.localStorage = localStorage;
context.sessionStorage = sessionStorage;
context.globalThis = context;
vm.createContext(context);
for (const file of ['dashboard/dashboard-config.js', 'dashboard/dashboard-state.js', 'dashboard/dashboard-mqtt.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const config = context.window.SmartFarmDashboardConfig;
const store = context.window.SmartFarmDashboardState;
const manager = context.window.SmartFarmDashboardMqtt;
const controlRoomHtml = fs.readFileSync('control-room/index.html', 'utf8');
const controlRoomScheduleJs = fs.readFileSync('control-room/control-room-schedule.js', 'utf8');
const canonicalDashboardHtml = fs.readFileSync('dashboard/index.html', 'utf8');
const check = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

check(store.get().esp.emergencyLock === null && store.get().esp.pumpSafeLock === null, 'safety states remain unknown until firmware reports them');
check(controlRoomHtml.includes('../dashboard/?page=water'), 'legacy Control Room route redirects to the canonical Water page');
check((canonicalDashboardHtml.match(/dashboard-mqtt\.js/g) || []).length === 1, 'the unified dashboard loads exactly one shared MQTT manager');
check(canonicalDashboardHtml.includes('control-room-schedule.js') && canonicalDashboardHtml.includes('id="scheduleForm"'), 'Firebase planning is embedded in the unified dashboard');
check(controlRoomScheduleJs.includes('data-id="${escapeHtml(item.id)}"'), 'Firebase schedule IDs are escaped before HTML attribute rendering');

manager.handleMessage(config.topics.device, JSON.stringify({ online: true, mqtt: true, firmware: 'V7.1.1', uptimeSec: 10, rssi: -60 }), { retain: true });
check(store.get().esp.online === null, 'retained heartbeat snapshot cannot unlock ESP controls');
check(store.get().esp.pumpRuntimeSec === null, 'missing pump runtime remains unavailable instead of becoming zero');
check(store.get().esp.lastHeartbeatWasRetained === true, 'retained heartbeat is recorded as retained');

manager.handleMessage(config.topics.device, JSON.stringify({ online: true, mqtt: true, firmware: 'V7.1.1', uptimeSec: 20, rssi: -61 }), { retain: true });
check(store.get().esp.online === null, 'changed retained snapshot still cannot unlock ESP controls');
check(store.get().esp.lastHeartbeatWasRetained === true, 'retained snapshot remains marked as retained even when payload changes');
check(store.get().esp.firmware === 'V7.1.1', 'heartbeat firmware is displayed from device payload');

manager.handleMessage(config.topics.device, '{"device_id":"SmartFarm-ESP8266","online":true,"wifi":true,"mqtt":true,"firmware":"V7.1.1","uptimeSec":30,"rssi":-62,"time":"2026-09-23T20:', { retain: false });
check(store.get().esp.online === true && store.get().esp.deviceId === 'SmartFarm-ESP8266', 'a live non-retained heartbeat exposes real ESP liveness');

store.state.esp.lastHeartbeatAt = Date.now() - 26000;
store.checkHeartbeat(config.mqtt.heartbeatTimeoutMs);
check(store.get().esp.online === false, 'heartbeat older than 25 seconds marks ESP offline');

manager.handleMessage(config.topics.dht11, JSON.stringify({ temperature: 31.25, humidity: 68 }), { retain: false });
check(store.get().sensor.temperature === 31.25 && store.get().sensor.humidity === 68, 'DHT11 JSON is parsed into sensor state');
manager.handleMessage(config.topics.dht11, JSON.stringify({ temperature: null, humidity: null }), { retain: false });
check(store.get().sensor.temperature === null && store.get().sensor.humidity === null, 'null DHT11 values remain unavailable instead of becoming zero');

manager.handleMessage(config.topics.modeStatus, 'AUTO', { retain: true });
check(store.get().mode === 'AUTO', 'mode status is accepted');

manager.handleMessage(config.topics.emergencyStatus, JSON.stringify({ active: true, source: 'mqtt', time: '2026-09-27T01:00:00+07:00' }), { retain: true });
check(store.get().esp.emergencyLock === true && store.get().esp.emergencySource === 'mqtt', 'emergency status is accepted from firmware');
manager.handleMessage(config.topics.time, JSON.stringify({ date: '2026-09-27', time: '01:00:00', timezone: 'Asia/Bangkok' }), { retain: false });
check(store.get().esp.time === '2026-09-27T01:00:00' && store.get().esp.clockValid === true, 'firmware time status is accepted');

manager.handleMessage(config.topics.relayStatus('pump'), 'OFF', { retain: true });
check(store.get().relays.pump === false, 'relay OFF status is accepted');
store.setRelay('pump', null);
check(store.get().relays.pump === null, 'null relay status remains unknown instead of becoming OFF');
manager.handleMessage(config.topics.device, JSON.stringify({ online: true, mqtt: true, firmware: 'V7.2.1-OTA-ACCESS-FIX', uptimeSec: 35, otaReady: true, otaStatus: 'READY', otaProgress: 0, rssi: -60 }), { retain: false });
check(store.get().esp.firmware === 'V7.2.1-OTA-ACCESS-FIX' && store.get().esp.otaReady === true && store.get().esp.otaStatus === 'READY', 'V7.2.1 firmware and OTA diagnostics are accepted from heartbeat');

check(manager.connect() === true && fakeClient, 'MQTT connect starts the single browser client');
fakeClient.emit('connect');
check(store.get().mqtt.status === 'connected', 'MQTT connected state is exposed separately');
store.state.relays.pump = null;
check(manager.publish(config.topics.relaySet('pump'), 'ON') === true, 'relay command publishes through the single manager');
check(store.get().relays.pump === null, 'relay command does not optimistically change UI state');
manager.handleMessage(config.topics.relayStatus('pump'), 'ON', { retain: true });
check(store.get().relays.pump === true, 'relay status from ESP changes UI state');
manager.handleMessage(config.topics.online, 'false', { retain: true });
check(store.get().esp.online === false, 'LWT status/online=false marks ESP offline');
check(store.get().diagnostic.connectionReason === 'status/online=false', 'LWT offline reason is recorded');
manager.handleMessage(config.topics.device, JSON.stringify({ online: true, mqtt: true, firmware: 'V7.1.1', uptimeSec: 24, rssi: -61 }), { retain: true });
check(store.get().esp.online === false, 'retained heartbeat cannot override LWT offline');
manager.handleMessage(config.topics.device, JSON.stringify({ online: true, mqtt: true, firmware: 'V7.1.1', uptimeSec: 25, rssi: -61 }), { retain: false });
check(store.get().esp.online === true, 'live heartbeat restores ESP online after LWT');
check(fakeClient.published[0].payload === 'ON' && fakeClient.published[0].options.retain === false, 'relay command uses ON payload and non-retained publish');
check(fakeClient.subscriptions.some(item => item.topic === 'smartfarm/status/device'), 'dashboard subscribes to device heartbeat');
check(fakeClient.subscriptions.some(item => item.topic === 'smartfarm/relay/+/status'), 'dashboard subscribes to relay status wildcard');
check(fakeClient.subscriptions.some(item => item.topic === 'smartfarm/emergency/status'), 'dashboard subscribes to emergency status');
check(fakeClient.subscriptions.some(item => item.topic === 'smartfarm/config/telegram/status'), 'dashboard subscribes to Telegram status');
check(config.topics.emergencySet === 'smartfarm/emergency/set', 'dashboard emergency command matches firmware topic');
check(events.filter(event => event.type === 'smartfarm:mqtt:connected').length === 1, 'one MQTT connected event is emitted');

manager.saveCredentials('session-user', 'session-secret', false);
check(session.get('smartfarm.dashboard.password') === 'session-secret' && !storage.has('smartfarm.dashboard.password'), 'MQTT password is session-scoped by default');
manager.saveCredentials('remember-user', 'remember-secret', true);
check(storage.get('smartfarm.dashboard.password') === 'remember-secret' && !session.has('smartfarm.dashboard.password'), 'MQTT password persists only after explicit remember choice');
manager.clearCredentials();
check(!storage.has('smartfarm.dashboard.password') && !session.has('smartfarm.dashboard.password'), 'clear credentials removes both persistent and session values');

console.log('\nClean dashboard MQTT contract tests passed.');
