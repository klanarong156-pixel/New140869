import assert from 'node:assert/strict';

const pumpPowerKw = 1.5;
const tariff = 4.2;
const flowRate = 20;
const minuteCost = pumpPowerKw * tariff / 60;

function totals(events, from, to, resetAt = 0) {
  const effectiveFrom = resetAt && to >= resetAt ? Math.max(from, resetAt) : from;
  if (effectiveFrom > to) return { minutes: 0, runs: 0, liters: 0, energy: 0, cost: 0 };
  let activeAt = null, minutes = 0, runs = 0;
  [...events].sort((a, b) => a.at - b.at).forEach(item => {
    if (item.at < effectiveFrom) { activeAt = item.on ? effectiveFrom : null; return; }
    if (item.at > to) return;
    if (item.on && activeAt === null) { activeAt = item.at; runs += 1; }
    if (!item.on && activeAt !== null) { minutes += (item.at - activeAt) / 60000; activeAt = null; }
  });
  if (activeAt !== null) minutes += (to - activeAt) / 60000;
  const energy = minutes / 60 * pumpPowerKw;
  return { minutes, runs, liters: minutes * flowRate, energy, cost: energy * tariff };
}

const start = Date.parse('2026-08-30T00:00:00Z');
const resetAt = Date.parse('2026-08-30T10:00:00Z');
const beforeReset = [
  { on: true, at: Date.parse('2026-08-30T08:00:00Z') },
  { on: false, at: Date.parse('2026-08-30T08:30:00Z') },
];
const old = totals(beforeReset, start, Date.parse('2026-08-30T09:59:59Z'));
assert.equal(old.minutes, 30);
assert.ok(Math.abs(old.energy - 0.75) < 1e-9);
assert.ok(Math.abs(old.cost - 3.15) < 1e-9);

const afterReset = totals(beforeReset, start, Date.parse('2026-08-30T10:00:00Z'), resetAt);
assert.deepEqual(afterReset, { minutes: 0, runs: 0, liters: 0, energy: 0, cost: 0 });

const afterResetRun = totals([
  ...beforeReset,
  { on: true, at: Date.parse('2026-08-30T10:10:00Z') },
  { on: false, at: Date.parse('2026-08-30T10:25:00Z') },
], start, Date.parse('2026-08-30T10:30:00Z'), resetAt);
assert.equal(afterResetRun.minutes, 15);
assert.equal(afterResetRun.runs, 1);
assert.equal(afterResetRun.liters, 300);
assert.ok(Math.abs(afterResetRun.energy - 0.375) < 1e-9);
assert.ok(Math.abs(afterResetRun.cost - 1.575) < 1e-9);
assert.ok(Math.abs(minuteCost - 0.105) < 1e-9);

console.log('PASS usage reset: pre-reset history excluded from current totals');
console.log('PASS usage reset: current totals are exactly 0 after reset');
console.log(`PASS usage calculation: 15 minutes = ${afterResetRun.liters} L, ${afterResetRun.energy.toFixed(3)} kWh, ฿${afterResetRun.cost.toFixed(3)}`);
