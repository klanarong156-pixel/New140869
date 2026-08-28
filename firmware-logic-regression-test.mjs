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

// This is a small executable model of the exact safety-relevant branch in
// runRelayTimers(): clear the timer, then perform at most one OFF transition
// unless a valid RTC schedule still requires ON.
function resolveExpiredTimer({ relayOn, slots, minute, rtcValid, emergencyLock, otaUpdateInProgress }) {
  const scheduleKeepsOn = !emergencyLock && !otaUpdateInProgress && rtcValid && scheduleDesired(slots, minute);
  return {
    timerCleared: true,
    relayOn: scheduleKeepsOn ? relayOn : false,
    gpioWrites: scheduleKeepsOn && relayOn ? [] : relayOn ? ['OFF'] : []
  };
}

const daytime = [{ enabled: true, onH: 6, onM: 0, offH: 8, offM: 0 }];
const crossMidnight = [{ enabled: true, onH: 23, onM: 0, offH: 1, offM: 0 }];

let result = resolveExpiredTimer({ relayOn: true, slots: daytime, minute: 7 * 60, rtcValid: true, emergencyLock: false, otaUpdateInProgress: false });
assert.deepEqual(result.gpioWrites, [], 'timer expiry inside an active schedule must not create an OFF pulse');
assert.equal(result.relayOn, true, 'active schedule must keep relay ON after timer expiry');

result = resolveExpiredTimer({ relayOn: true, slots: daytime, minute: 9 * 60, rtcValid: true, emergencyLock: false, otaUpdateInProgress: false });
assert.deepEqual(result.gpioWrites, ['OFF'], 'timer expiry outside schedule must turn relay OFF once');
assert.equal(result.relayOn, false, 'outside schedule relay must be OFF');

result = resolveExpiredTimer({ relayOn: true, slots: crossMidnight, minute: 30, rtcValid: true, emergencyLock: false, otaUpdateInProgress: false });
assert.deepEqual(result.gpioWrites, [], 'cross-midnight schedule must also prevent an OFF pulse');

for (const safetyState of [
  { emergencyLock: true, otaUpdateInProgress: false },
  { emergencyLock: false, otaUpdateInProgress: true },
  { emergencyLock: true, otaUpdateInProgress: true }
]) {
  result = resolveExpiredTimer({ relayOn: true, slots: daytime, minute: 7 * 60, rtcValid: true, ...safetyState });
  assert.deepEqual(result.gpioWrites, ['OFF'], 'Emergency/OTA state must always resolve to OFF');
  assert.equal(result.relayOn, false, 'Emergency/OTA state must never keep relay ON');
}

result = resolveExpiredTimer({ relayOn: true, slots: daytime, minute: 7 * 60, rtcValid: false, emergencyLock: false, otaUpdateInProgress: false });
assert.deepEqual(result.gpioWrites, ['OFF'], 'invalid RTC must fail safe to OFF at timer expiry');

console.log('PASS firmware-logic-regression: timer expiry has no OFF pulse inside active schedule, turns OFF outside schedule, and remains safety-first');
