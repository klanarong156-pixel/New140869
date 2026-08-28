import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./ai-farm-advisor.js', import.meta.url), 'utf8');
const listeners = new Map();
const elements = new Map();
const local = new Map();
const makeElement = id => ({ id, textContent: '', checked: false, children: [], replaceChildren(...items) { this.children = items; }, append(...items) { this.children.push(...items); }, addEventListener(type, fn) { this[`on${type}`] = fn; } });
for (const id of ['aiAdvisorStatus', 'aiAdvisorDetail', 'aiAdvisorMeta', 'aiAdvisorHistory', 'aiAdvisorEnabled', 'aiAdvisorAnalyze']) elements.set(id, makeElement(id));
const windowObject = {
  APP_STATE: { mqttConnected: true },
  MQTT_CONFIG: { topics: { aiAlertSet: 'smartfarm/ai/alert/set' } },
  mqttHandler: { published: [], publish(topic, payload) { this.published.push({ topic, payload }); return true; } },
  farmAnalytics: { recordTask() {} },
  SmartFarmWeather: { state: { autoWateringAllowed: true } },
  addEventListener(type, fn) { listeners.set(type, fn); },
  setTimeout() { return 1; },
  clearTimeout() {}
};
const documentObject = { readyState: 'complete', getElementById(id) { return elements.get(id) || null; }, createElement(tag) { return makeElement(tag); }, addEventListener() {} };
const context = vm.createContext({ window: windowObject, document: documentObject, localStorage: { getItem(k) { return local.get(k) || null; }, setItem(k, v) { local.set(k, v); } }, console, Date, Math, JSON, Number, String, Object, Array, setTimeout: windowObject.setTimeout, clearTimeout() {} });
vm.runInContext(source, context);
const advisor = windowObject.farmAiAdvisor;
assert.ok(advisor, 'advisor export exists');

listeners.get('sensor:data')({ detail: { type: 'temperature', value: 39 } });
listeners.get('sensor:data')({ detail: { type: 'humidity', value: 25 } });
listeners.get('device:data')({ detail: { emergencyLock: false, rtcValid: true, sensorOk: true } });
const result = advisor.analyze('manual');
assert.equal(result.findings[0].id, 'high-temperature');
assert.ok(result.findings.some(item => item.id === 'low-humidity'));
assert.equal(windowObject.mqttHandler.published.length, 0, 'manual analysis does not alert automatically');

windowObject.mqttHandler.published.length = 0;
listeners.get('sensor:data')({ detail: { type: 'temperature', value: 39 } });
const automatic = advisor.analyze('sensor');
assert.equal(windowObject.mqttHandler.published.length, 1, 'automatic warning sends exactly one alert');
const payload = JSON.parse(windowObject.mqttHandler.published[0].payload);
assert.equal(windowObject.mqttHandler.published[0].topic, 'smartfarm/ai/alert/set');
assert.equal(payload.id, automatic.findings[0].id);
assert.equal(payload.severity, 'critical');
assert.ok(!('relay' in payload), 'AI payload cannot carry relay command fields');
assert.equal(advisor.analyze('sensor').findings[0].id, 'high-temperature');
assert.equal(windowObject.mqttHandler.published.length, 1, 'cooldown suppresses duplicate alert');

listeners.get('device:data')({ detail: { emergencyLock: true } });
const emergency = advisor.analyze('device');
assert.ok(emergency.findings.some(item => item.id === 'emergency-lock'));
assert.equal(windowObject.mqttHandler.published.length, 1, 'same alert remains rate-limited');
assert.ok(JSON.parse(local.get('smartfarm.aiAdvisor.v1')).history.length >= 4, 'history persisted');
console.log('AI_ADVISOR_REGRESSION_OK');
