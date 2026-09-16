import assert from 'node:assert/strict';

function validHM(hour, minute) {
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60;
}

function slotIsOn(slot, minute) {
  if (!slot.enabled || !validHM(slot.onH, slot.onM) || !validHM(slot.offH, slot.offM)) return false;
  const on = slot.onH * 60 + slot.onM;
  const off = slot.offH * 60 + slot.offM;
  if (on === off) return false;
  return on < off ? minute >= on && minute < off : minute >= on || minute < off;
}

function scheduleDesired(slots, minute) {
  return slots.some(slot => slotIsOn(slot, minute));
}

function applyOnOff({ requestedOn, emergencyLock, otaUpdateInProgress, pumpSafetyLatched = false }) {
  if (requestedOn && (emergencyLock || otaUpdateInProgress || pumpSafetyLatched)) return false;
  return Boolean(requestedOn);
}

const daytime = [{ enabled: true, onH: 6, onM: 0, offH: 8, offM: 0 }];
const crossMidnight = [{ enabled: true, onH: 23, onM: 0, offH: 1, offM: 0 }];

assert.equal(applyOnOff({ requestedOn: true, emergencyLock: false, otaUpdateInProgress: false }), true, 'ON command must turn relay ON');
assert.equal(applyOnOff({ requestedOn: false, emergencyLock: false, otaUpdateInProgress: false }), false, 'OFF command must turn relay OFF');
for (const safetyState of [
  { emergencyLock: true, otaUpdateInProgress: false },
  { emergencyLock: false, otaUpdateInProgress: true },
  { emergencyLock: false, otaUpdateInProgress: false, pumpSafetyLatched: true }
]) {
  assert.equal(applyOnOff({ requestedOn: true, ...safetyState }), false, 'safety locks must block ON');
}
assert.equal(scheduleDesired(daytime, 7 * 60), true, 'active daytime schedule must request ON');
assert.equal(scheduleDesired(daytime, 9 * 60), false, 'outside daytime schedule must request OFF');
assert.equal(scheduleDesired(crossMidnight, 30), true, 'cross-midnight schedule must request ON');
assert.equal(scheduleDesired(crossMidnight, 12 * 60), false, 'outside cross-midnight schedule must request OFF');

console.log('PASS firmware-logic-regression: relay uses ON/OFF only, safety blocks ON, and Schedule state remains correct');
