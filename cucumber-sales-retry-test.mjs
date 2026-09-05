import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadCore(patch) {
  const db = {
    async get() { return null; },
    patch
  };
  const context = {
    window: { FirebaseDB: db, SMARTFARM_ACCESS: { user: { localId: 'user-1' } } },
    FirebaseDB: db,
    setTimeout,
    crypto: { getRandomValues(values) { values[0] = 123; return values; } }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('cucumber-sales-firebase.js', 'utf8'), context);
  return context.window.CucumberSales;
}

const input = {
  date: '2026-09-05',
  customerId: 'CUS-1',
  customerName: 'ตลาดสดบ้านนา',
  grades: {
    good: { weight: 2, price: 40 },
    sorted: { weight: 0, price: 0 },
    large: { weight: 0, price: 0 }
  }
};

let transientAttempts = 0;
const transientCore = loadCore(async () => {
  transientAttempts += 1;
  if (transientAttempts === 1) throw new Error('HTTP 503 Service Unavailable');
  if (transientAttempts === 2) throw new TypeError('Failed to fetch');
  return { ok: true };
});
const saved = await transientCore.saveSale(input);
assert.equal(saved.totalAmount, 80);
assert.equal(transientAttempts, 3, 'network and HTTP 5xx errors should retry up to success');

let permanentAttempts = 0;
const permanentCore = loadCore(async () => {
  permanentAttempts += 1;
  throw new Error('HTTP 400 Bad Request');
});
await assert.rejects(() => permanentCore.saveSale(input), /HTTP 400/);
assert.equal(permanentAttempts, 1, 'HTTP 4xx errors must not be retried');

const invalidCore = loadCore(async () => {
  throw new Error('patch should not be called for invalid input');
});
await assert.rejects(() => invalidCore.saveSale({ ...input, grades: { good: { weight: -1, price: 40 } } }), /น้ำหนักแตงกวาต้องไม่ติดลบ/);

console.log('Cucumber retry checks passed');
