import fs from 'node:fs';
import vm from 'node:vm';

const context = { window: {}, crypto: { getRandomValues(values) { values[0] = 123; return values; } } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('cucumber-sales-firebase.js', 'utf8'), context);
const core = context.window.CucumberSales;
const valid = core.validateSale({
  date: '2026-09-04',
  customerId: 'CUS-1',
  customerName: 'ตลาดสดบ้านนา',
  grades: {
    good: { weight: '10', price: '50' },
    sorted: { weight: '5.5', price: '30' },
    large: { weight: '', price: '' }
  }
});
if (valid.totalWeight !== 15.5 || valid.totalAmount !== 665) throw new Error(`calculation mismatch: ${JSON.stringify(valid)}`);
for (const bad of [
  { date: '2026/09/04', customerId: 'CUS-1', customerName: 'x', grades: { good: { weight: 1, price: 1 } } },
  { date: '2026-09-04', customerId: '', customerName: '', grades: { good: { weight: 1, price: 1 } } },
  { date: '2026-09-04', customerId: 'CUS-1', customerName: 'x', grades: { good: { weight: 0, price: 1 }, sorted: { weight: 0, price: 1 }, large: { weight: 0, price: 1 } } }
]) {
  let rejected = false;
  try { core.validateSale(bad); } catch { rejected = true; }
  if (!rejected) throw new Error(`invalid input accepted: ${JSON.stringify(bad)}`);
}
console.log('Cucumber core checks passed');
