import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const coreContext = { window: {}, crypto: { getRandomValues(values) { values[0] = 123; return values; } } };
vm.createContext(coreContext);
vm.runInContext(fs.readFileSync('cucumber-sales-firebase.js', 'utf8'), coreContext);
const core = coreContext.window.CucumberSales;
const valid = core.validateSale({ date: '2026-09-05', customerId: 'C-1', customerName: 'ลูกค้า', grades: { good: { weight: 10, price: 50 }, sorted: { weight: 5.5, price: 30 }, large: { weight: 0, price: 0 } } });
assert.equal(valid.totalWeight, 15.5);
assert.equal(valid.totalAmount, 665);
assert.throws(() => core.validateSale({ date: '2026-09-05', customerId: 'C-1', customerName: 'ลูกค้า', grades: { good: { weight: -1, price: 50 } } }), /น้ำหนักแตงกวาต้องไม่ติดลบ/);
assert.throws(() => core.validateSale({ date: '2026-09-05', customerId: 'C-1', customerName: 'ลูกค้า', grades: { good: { weight: 1, price: -50 } } }), /ราคาขายต้องไม่ติดลบ/);

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
const nodes = Object.fromEntries(['dashboardCucumberToday', 'dashboardCucumberWeight', 'dashboardCucumberMonth', 'dashboardCucumberCount', 'dashboardCucumberStatus'].map(id => [id, { textContent: '' }]));
let ready;
const dashboardContext = {
  window: {
    CucumberSales: { loadCucumberData: async () => ({ sales: [
      { id: 'SALE-1', date: today, status: 'posted', totalWeight: 999, totalAmount: 999999, grades: { good: { weight: 2, price: 10 }, sorted: { weight: 1, price: 30 }, large: { weight: 0, price: 0 } } },
      { id: 'SALE-2', date: today, status: 'cancelled', totalWeight: 100, totalAmount: 10000, grades: { good: { weight: 100, price: 100 } } }
    ] }) },
    FirebaseDB: {},
    addEventListener(event, callback) { if (event === 'access:ready') ready = callback; }
  },
  document: { getElementById(id) { return nodes[id]; } },
  console
};
vm.createContext(dashboardContext);
vm.runInContext(fs.readFileSync('cucumber-sales-dashboard.js', 'utf8'), dashboardContext);
await ready();
assert.equal(nodes.dashboardCucumberToday.textContent, '฿50.00');
assert.equal(nodes.dashboardCucumberWeight.textContent, '3.00 กก.');
assert.equal(nodes.dashboardCucumberMonth.textContent, '฿50.00');
assert.equal(nodes.dashboardCucumberCount.textContent, '1 รายการ');
console.log('Cucumber validation and Dashboard recompute checks passed');
