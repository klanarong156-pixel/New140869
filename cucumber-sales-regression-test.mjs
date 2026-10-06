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
    async get(path) { return this.writes.find(entry => entry.path === path)?.data || null; },
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

assert.deepEqual(plain(api.summarize([flat, quick])), { total: 115, simple: 25, good: 80, sorted: 10, large: 0, income: 1500 });
const quoted = api.normalize({ date: '2026-09-24', totalWeight: 1, weights: { good: 1, sorted: 0, large: 0 }, note: 'ตลาด "เช้า", ลูกค้าประจำ' });
const formula = api.normalize({ date: '2026-09-24', totalWeight: 1, weights: { good: 1, sorted: 0, large: 0 }, note: '=HYPERLINK("https://example.com")' });
const report = api.toCsv([flat, quick, quoted, formula]);
assert.equal(report.charCodeAt(0), 0xFEFF);
assert.match(report, /รายงานผลผลิตและการขายแตงกวา/);
assert.match(report, /"น้ำหนักรวม \(กก\.\)","117"/);
assert.ok(report.includes('ตลาด ""เช้า"", ลูกค้าประจำ'));
assert.ok(report.includes("'=HYPERLINK("));
assert.ok(api.toCsv([]).includes('"จำนวนรายการ","0"'));

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
const ui = fs.readFileSync('cucumber-sales-ui.js', 'utf8');
assert.match(ui, /\.then\(loadedItems => \{/);
assert.match(ui, /items = loadedItems \|\| \[\];/);
assert.doesNotMatch(ui, /\.then\(items => \{/);
const html = fs.readFileSync('dashboard/index.html', 'utf8');
const firebase = fs.readFileSync('firebase.js', 'utf8');
const databaseRules = fs.readFileSync('database.rules.json', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
assert.match(firebase, /users\/\$\{encodeURIComponent\(uid\)\}\/\$\{clean\}/);
const cucumberRuleStart = databaseRules.indexOf('"cucumberSales"');
const cucumberRuleEnd = databaseRules.indexOf('"farm":', cucumberRuleStart);
const cucumberRules = databaseRules.slice(cucumberRuleStart, cucumberRuleEnd);
assert.ok(cucumberRules.includes('".read": "auth != null && auth.uid === $uid"'));
assert.match(html, /id="cucumberSalesDownload"[^>]*disabled/);
assert.match(html, /cucumber-sales\.css\?v=5/);
assert.match(html, /cucumber-sales\.js\?v=6/);
assert.match(html, /cucumber-sales-ui\.js\?v=5/);
assert.match(sw, /smartfarm-v54-unified-dashboard/);
assert.match(sw, /cucumber-sales\.css\?v=5/);
assert.match(sw, /cucumber-sales-ui\.js\?v=5/);
assert.match(ui, /window\.CucumberSales\.toCsv\(items\)/);
assert.match(ui, /downloadButton\?\.addEventListener\('click', downloadReport\)/);

const elementIds = [
  'cucumberSalesForm', 'cucumberSalesStatus', 'cucumberSalesRows', 'cucumberSalesEmpty',
  'cucumberTotalWeight', 'cucumberTotalIncome', 'cucumberPaymentStatus', 'cucumberGoodWeight',
  'cucumberGoodPrice', 'cucumberSortedWeight', 'cucumberSortedPrice', 'cucumberLargeWeight',
  'cucumberSaleDate', 'cucumberSaleNote', 'cucumberSummaryTotal', 'cucumberSummarySimple',
  'cucumberSummaryGood', 'cucumberSummarySorted', 'cucumberSummaryLarge', 'cucumberSummaryIncome',
  'cucumberSalesRetry', 'cucumberSalesDownload'
];
const submitButton = { disabled: false, textContent: 'บันทึกผลผลิต' };
const elements = new Map(elementIds.map(id => [id, {
  id, value: '', textContent: '', className: '', hidden: false,
  disabled: id === 'cucumberSalesDownload', dataset: {}, listeners: {}, innerHTML: '',
  addEventListener(type, handler) { this.listeners[type] = handler; },
  querySelector() { return submitButton; }
}]));
let downloadAnchor;
let downloadedBlob;
let revokedUrl = '';
const documentStub = {
  body: { appendChild(node) { downloadAnchor = node; } },
  getElementById(id) { return elements.get(id) || null; },
  createElement(tag) {
    assert.equal(tag, 'a');
    return { click() { this.clicked = true; }, remove() { this.removed = true; } };
  }
};
const windowStub = {
  SMARTFARM_ACCESS: { ready: true, user: { localId: 'test-user' } },
  CucumberSales: { ...api, async load() { return [flat, quick]; } },
  addEventListener() {}, dispatchEvent() {},
  setTimeout(callback) { callback(); return 1; }
};
class MockBlob {
  constructor(parts, options) { this.parts = parts; this.type = options.type; downloadedBlob = this; }
}
const uiContext = {
  window: windowStub, document: documentStub, Blob: MockBlob, Date,
  URL: { createObjectURL() { return 'blob:test-cucumber-report'; }, revokeObjectURL(url) { revokedUrl = url; } }
};
vm.runInNewContext(ui, uiContext, { filename: 'cucumber-sales-ui.js' });
assert.equal(elements.get('cucumberSalesDownload').disabled, true);
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(elements.get('cucumberSalesDownload').disabled, false);
elements.get('cucumberSalesDownload').listeners.click();
assert.equal(downloadAnchor.clicked, true);
assert.match(downloadAnchor.download, /^cucumber-sales-report-\d{4}-\d{2}-\d{2}\.csv$/);
assert.equal(downloadedBlob.type, 'text/csv;charset=utf-8');
assert.ok(downloadedBlob.parts[0].startsWith('\uFEFF'));
assert.equal(revokedUrl, 'blob:test-cucumber-report');
assert.match(elements.get('cucumberSalesStatus').textContent, /สร้างรายงานแตงกวา CSV แล้ว/);
console.log('Cucumber Sales regression: CSV, privacy, escaping, UI download flow passed');
