import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./schedule.js', import.meta.url), 'utf8');
const listeners = new Map();
const elements = new Map();
const published = [];
const toasts = [];
let now = 1000;

for (let index = 0; index < 4; index += 1) {
  elements.set(`slotOn${index}`, { value: '00:00', addEventListener() {} });
  elements.set(`slotOff${index}`, { value: '00:00', addEventListener() {} });
}
for (const id of ['scheduleValidation', 'schedSummary', 'scheduleRelayTitle', 'scheduleRelayCaption']) {
  elements.set(id, { value: '', textContent: '', hidden: false });
}

const document = {
  readyState: 'complete',
  getElementById(id) { return elements.get(id) || null; },
  querySelectorAll() { return []; },
  addEventListener(type, callback) { listeners.set(type, callback); }
};
const window = {
  RELAYS: ['pump', 'zone1', 'lighthome', 'lightsala'],
  RELAY_NAMES: { pump: 'ปั๊ม' },
  showToast(message, kind) { toasts.push({ message, kind }); },
  confirm() { return true; },
  addEventListener(type, callback) { listeners.set(type, callback); },
  mqttHandler: {
    publish(topic, payload) {
      published.push({ topic, payload });
      return true;
    },
    showSetup() {}
  }
};
const context = {
  window,
  document,
  MQTT_CONFIG: { topics: { scheduleSet: relay => `smartfarm/schedule/${relay}/set` } },
  Date: { ...Date, now: () => now },
  console
};
context.globalThis = context;
vm.runInNewContext(source, context, { filename: 'schedule.js' });

function setSlots(...ranges) {
  for (let index = 0; index < 4; index += 1) {
    const [on, off] = ranges[index] || ['00:00', '00:00'];
    elements.get(`slotOn${index}`).value = on;
    elements.get(`slotOff${index}`).value = off;
  }
}
function status(slots) {
  listeners.get('schedule:status')?.({ detail: { relay: 'pump', schedule: { slots } } });
}
function save() { return window.saveSchedule(); }
function deleteSchedule() { return window.deleteSchedule(); }

// Normal and adjacent intervals are valid.
setSlots(['06:00', '08:00'], ['08:00', '09:00']);
assert.equal(save(), true, 'normal + adjacent intervals should save');
assert.equal(published.length, 1, 'first save should publish once');

// A matching device status is an acknowledgement and releases the one-flight guard.
status([
  { enabled: true, on: '06:00', off: '08:00' },
  { enabled: true, on: '08:00', off: '09:00' },
  { enabled: false, on: '00:00', off: '00:00' },
  { enabled: false, on: '00:00', off: '00:00' }
]);
assert.equal(save(), true, 'matching status should release the save guard');
assert.equal(published.length, 2, 'acknowledged save should permit the next save');

// A repeated Save before acknowledgement is suppressed.
assert.equal(save(), false, 'repeated save before acknowledgement should be blocked');
assert.equal(published.length, 2, 'repeated save must not publish a duplicate command');

// The guard expires, then DELETE is accepted and a following SAVE is blocked.
now += 9000;
assert.equal(deleteSchedule(), true, 'delete should be accepted after the guard timeout');
assert.equal(published.at(-1).payload, 'DELETE', 'delete must publish the existing DELETE command');
assert.equal(save(), false, 'save immediately after delete must be blocked');
assert.equal(published.length, 3, 'delete/save ordering must not add a duplicate save');

// Cross-midnight overlap is rejected.
now += 9000;
setSlots(['23:00', '01:00'], ['00:30', '02:00']);
assert.equal(save(), false, 'cross-midnight overlap should be rejected');
assert.equal(published.length, 3, 'overlap rejection must not publish');

// Out-of-range times are rejected instead of being treated as unused.
setSlots(['24:00', '01:00']);
assert.equal(save(), false, '24:00 must be rejected');
setSlots(['12:00', '12:60']);
assert.equal(save(), false, '12:60 must be rejected');
assert.equal(published.length, 3, 'invalid times must not publish');

console.log('PASS schedule-regression: normal, adjacent, ACK release, duplicate guard, delete ordering, cross-midnight overlap, invalid HH:MM');
console.log(`PASS schedule-regression: ${published.length} MQTT commands published in deterministic scenario`);
