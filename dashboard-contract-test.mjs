import fs from 'node:fs';
import vm from 'node:vm';

const events = [];
const listeners = new Map();
const storage = new Map([
  ['smartfarm.dashboard.username', 'smartfarm'],
  ['smartfarm.dashboard.password', 'test-password']
]);

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
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); }
    },
    mqtt: {
      connect() { fakeClient = new FakeClient(); return fakeClient; }
    }
  }
};
context.CustomEvent = context.window.CustomEvent;
context.localStorage = context.window.localStorage;
context.globalThis = context;
vm.createContext(context);
for (const file of ['dashboard/dashboard-config.js', 'dashboard/dashboard-state.js', 'dashboard/dashboard-mqtt.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const config = context.window.SmartFarmDashboardConfig;
const store = context.window.SmartFarmDashboardState;
const manager = context.window.SmartFarmDashboardMqtt;
const check = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

manager.handleMessage(config.topics.device, JSON.stringify({ online: true, mqtt: true, firmware: 'V7.1.1', uptimeSec: 10, rssi: -60 }), { retain: true });
check(store.get().esp.online === false, 'retained heartbeat does not mark ESP online');
check(store.get().esp.lastHeartbeatWasRetained === true, 'retained heartbeat is recorded as retained');

manager.handleMessage(config.topics.device, JSON.stringify({ online: true, mqtt: true, firmware: 'V7.1.1', uptimeSec: 20, rssi: -61 }), { retain: false });
check(store.get().esp.online === true, 'fresh heartbeat marks ESP online');
check(store.get().esp.firmware === 'V7.1.1', 'heartbeat firmware is displayed from device payload');

store.state.esp.lastHeartbeatAt = Date.now() - 26000;
store.checkHeartbeat(config.mqtt.heartbeatTimeoutMs);
check(store.get().esp.online === false, 'heartbeat older than 25 seconds marks ESP offline');

manager.handleMessage(config.topics.dht11, JSON.stringify({ temperature: 31.25, humidity: 68 }), { retain: false });
check(store.get().sensor.temperature === 31.25 && store.get().sensor.humidity === 68, 'DHT11 JSON is parsed into sensor state');

manager.handleMessage(config.topics.modeStatus, 'AUTO', { retain: true });
check(store.get().mode === 'AUTO', 'mode status is accepted');

manager.handleMessage(config.topics.relayStatus('pump'), 'OFF', { retain: true });
check(store.get().relays.pump === false, 'relay OFF status is accepted');

check(manager.connect() === true && fakeClient, 'MQTT connect starts the single browser client');
fakeClient.emit('connect');
check(store.get().mqtt.status === 'connected', 'MQTT connected state is exposed separately');
store.state.relays.pump = null;
check(manager.publish(config.topics.relaySet('pump'), 'ON') === true, 'relay command publishes through the single manager');
check(store.get().relays.pump === null, 'relay command does not optimistically change UI state');
manager.handleMessage(config.topics.relayStatus('pump'), 'ON', { retain: true });
check(store.get().relays.pump === true, 'relay status from ESP changes UI state');
check(fakeClient.published[0].payload === 'ON' && fakeClient.published[0].options.retain === false, 'relay command uses ON payload and non-retained publish');
check(fakeClient.subscriptions.some(item => item.topic === 'smartfarm/status/device'), 'dashboard subscribes to device heartbeat');
check(fakeClient.subscriptions.some(item => item.topic === 'smartfarm/relay/+/status'), 'dashboard subscribes to relay status wildcard');
check(events.filter(event => event.type === 'smartfarm:mqtt:connected').length === 1, 'one MQTT connected event is emitted');

console.log('\nClean dashboard MQTT contract tests passed.');
