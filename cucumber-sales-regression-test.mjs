import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('cucumber-sales.js', 'utf8');
const context = {
  window: {},
  crypto: { getRandomValues(array) { array[0] = 1234; return array; } },
  Date,
  FirebaseDB: {
    writes: [],
    async put(path, data) { this.writes.push({ path, data }); await new Promise(resolve => setTimeout(resolve, 5)); return data; },
    async get() { return null; },
    async delete() {}
  }
};
vm.runInNewContext(source, context, { filename: 'cucumber-sales.js' });
const api = context.window.CucumberSales;
const plain = value => JSON.parse(JSON.stringify(value));

const legacy = api.normalize({ date: '2026-09-24', totalWeight: '90', weights: { good: '80', sorted: '10', large: '0' }, note: 'old schema' });
assert.equal(legacy.totalWeight, 90);
assert.deepEqual(plain(legacy.weights), { good: 80, sorted: 10, large: 0 });
assert.equal(legacy.note, 'old schema');

const flat = api.normalize({ date: '2026-09-24', gradeAKg: '80', gradeAPrice: '12', gradeBKg: '10', gradeBPrice: '4', note: 'new schema' });
assert.equal(flat.totalWeight, 90);
assert.equal(flat.gradeAKg, 80);
assert.equal(flat.gradeAPrice, 12);
assert.equal(flat.gradeBKg, 10);
assert.equal(flat.gradeBPrice, 4);
assert.deepEqual(plain(api.calculate(flat)), {
  gradeAKg: 80, gradeAPrice: 12, gradeAIncome: 960,
  gradeBKg: 10, gradeBPrice: 4, gradeBIncome: 40,
  legacyLargeKg: 0, totalKg: 90, totalIncome: 1000
});

const quick = api.normalize({ date: '2026-09-24', totalWeight: '25', totalIncome: '500', note: 'ขายตลาดเช้า' });
assert.equal(quick.entryMode, 'quick');
assert.equal(quick.totalIncome, 500);
assert.deepEqual(plain(api.calculate(quick)), {
  gradeAKg: 0, gradeAPrice: 0, gradeAIncome: 0,
  gradeBKg: 0, gradeBPrice: 0, gradeBIncome: 0,
  legacyLargeKg: 0, totalKg: 25, totalIncome: 500
});

const gradedPending = api.normalize({ date: '2026-09-24', entryMode: 'graded', weights: { good: '15', sorted: '10', large: '0' }, paymentStatus: 'pending' });
assert.equal(gradedPending.totalWeight, 25);
assert.deepEqual(plain(gradedPending.prices), { good: 0, sorted: 0 });
assert.equal(gradedPending.paymentStatus, 'pending');
assert.equal(api.calculate(gradedPending).totalIncome, 0);
const gradedPaid = api.normalize({ ...gradedPending, priceA: '20', priceB: '10', paymentStatus: 'paid' });
assert.equal(api.calculate(gradedPaid).totalIncome, 400);
assert.equal(gradedPaid.paymentStatus, 'paid');

for (const invalid of [
  { date: '2026-09-24', totalWeight: '-1', weights: { good: '1', sorted: '0', large: '0' } },
  { date: '2026-02-30', totalWeight: '1', weights: { good: '1', sorted: '0', large: '0' } },
  { date: '2026-09-24', totalWeight: '1', weights: { good: 'abc', sorted: '0', large: '0' } },
  { date: '2026-09-24', totalWeight: '2', weights: { good: '1', sorted: '0', large: '0' } }
]) assert.throws(() => api.normalize(invalid));

const first = api.save({ date: '2026-09-24', gradeAKg: 1, gradeAPrice: 12, gradeBKg: 0, gradeBPrice: 0 });
await assert.rejects(() => api.save({ date: '2026-09-24', gradeAKg: 1, gradeAPrice: 12, gradeBKg: 0, gradeBPrice: 0 }), /กำลังบันทึก/);
await first;
assert.equal(context.FirebaseDB.writes.length, 1);
assert.equal(context.FirebaseDB.writes[0].path.startsWith('cucumberSales/CUC-'), true);

const rules = fs.readFileSync('firebase.rules.json', 'utf8');
assert.match(rules, /"cucumberSales"/);
assert.match(rules, /gradeAKg/);
assert.match(rules, /gradeAPrice/);
assert.match(rules, /createdAt/);
console.log('Cucumber Sales regression: 20 passed, 0 failed');
