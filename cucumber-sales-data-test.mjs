import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const existingSale = {
  id: 'SALE-1',
  date: '2026-09-04',
  customerId: 'CUS-1',
  customerName: 'ตลาดสดบ้านนา',
  grades: {
    good: { weight: 10, price: 50, amount: 500 },
    sorted: { weight: 5.5, price: 30, amount: 165 },
    large: { weight: 0, price: 0, amount: 0 }
  },
  totalWeight: 15.5,
  totalAmount: 665,
  status: 'posted',
  createdAt: '2026-09-04T01:00:00.000Z',
  updatedAt: '2026-09-04T01:00:00.000Z',
  createdBy: 'user-1',
  accounting: { transactionId: 'CUCUMBER-INCOME-SALE-1', status: 'posted' }
};
const existingAccounting = {
  id: 'CUCUMBER-INCOME-SALE-1',
  type: 'income',
  category: 'การขายแตงกวา',
  source: 'cucumber_sales',
  sourceId: 'SALE-1',
  item: 'ขายแตงกวาให้ ตลาดสดบ้านนา',
  amount: 665,
  date: '2026-09-04',
  status: 'posted',
  createdAt: '2026-09-04T01:00:00.000Z',
  updatedAt: '2026-09-04T01:00:00.000Z',
  createdBy: 'user-1'
};
const oldFinance = {
  id: 'FIN-OLD',
  type: 'expense',
  item: 'ปุ๋ยอินทรีย์',
  amount: 320,
  createdAt: '2026-09-01T01:00:00.000Z'
};

function createHarness() {
  const data = {
    'cucumberSales/SALE-1': structuredClone(existingSale),
    'finance/CUCUMBER-INCOME-SALE-1': structuredClone(existingAccounting),
    'finance/FIN-OLD': structuredClone(oldFinance)
  };
  const calls = [];
  const db = {
    async get(path) {
      calls.push({ method: 'get', path });
      return data[path] === undefined ? null : structuredClone(data[path]);
    },
    async patch(path, updates) {
      calls.push({ method: 'patch', path, updates: structuredClone(updates) });
      assert.equal(path, '');
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null) delete data[key];
        else data[key] = structuredClone(value);
      });
      return updates;
    }
  };
  const context = {
    window: { FirebaseDB: db, SMARTFARM_ACCESS: { user: { localId: 'user-1' } } },
    FirebaseDB: db,
    crypto: { getRandomValues(values) { values[0] = 123; return values; } }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('cucumber-sales-firebase.js', 'utf8'), context);
  return { core: context.window.CucumberSales, data, calls };
}

const harness = createHarness();
const created = await harness.core.saveSale({
  date: '2026-09-05',
  customerId: 'CUS-1',
  customerName: 'ตลาดสดบ้านนา',
  grades: {
    good: { weight: 2, price: 40 },
    sorted: { weight: 0, price: 0 },
    large: { weight: 0, price: 0 }
  }
});
assert.match(created.id, /^SALE-/);
assert.equal(created.totalAmount, 80);
assert.equal(harness.data['finance/FIN-OLD'].amount, 320, 'old finance records must survive a new cucumber sale');
const createPatch = harness.calls.find(call => call.method === 'patch');
assert.deepEqual(Object.keys(createPatch.updates).sort(), [`cucumberSales/${created.id}`, `finance/CUCUMBER-INCOME-${created.id}`]);
assert.equal(createPatch.updates.finance, undefined, 'new sale must not replace the whole finance collection');

const saved = await harness.core.saveSale({
  id: 'SALE-1',
  date: '2026-09-05',
  customerId: 'CUS-1',
  customerName: 'ตลาดสดบ้านนา',
  grades: {
    good: { weight: 8, price: 55 },
    sorted: { weight: 5, price: 30 },
    large: { weight: 0, price: 0 }
  }
});
assert.equal(saved.id, 'SALE-1');
assert.equal(saved.totalAmount, 590);
assert.equal(harness.data['finance/FIN-OLD'].amount, 320, 'old finance records must survive a cucumber sale');
assert.equal(harness.data['finance/CUCUMBER-INCOME-SALE-1'].amount, 590);
const savePatch = harness.calls.filter(call => call.method === 'patch').at(-1);
assert.deepEqual(Object.keys(savePatch.updates).sort(), ['cucumberSales/SALE-1', 'finance/CUCUMBER-INCOME-SALE-1']);
assert.equal(savePatch.updates.finance, undefined, 'save must not replace the whole finance collection');
assert.equal(saved.createdAt, existingSale.createdAt, 'editing must preserve the original sale creation time');

await harness.core.deleteSale({ id: 'SALE-1' });
assert.equal(harness.data['cucumberSales/SALE-1'], undefined);
assert.equal(harness.data['finance/CUCUMBER-INCOME-SALE-1'], undefined);
assert.equal(harness.data['finance/FIN-OLD'].item, oldFinance.item, 'deleting a sale must not delete unrelated finance records');
const deletePatch = harness.calls.filter(call => call.method === 'patch').at(-1);
assert.deepEqual(Object.keys(deletePatch.updates).sort(), ['cucumberSales/SALE-1', 'finance/CUCUMBER-INCOME-SALE-1']);

console.log('Cucumber data integrity, edit, and delete checks passed');
