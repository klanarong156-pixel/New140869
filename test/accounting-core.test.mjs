import test from 'node:test';
import assert from 'node:assert/strict';
import Core from '../accounting-core.js';

const accounts = Core.DEFAULT_ACCOUNTS.map(account => ({ ...account, active: true }));
const accountMap = new Map(accounts.map(account => [account.id, account]));
const validEntry = () => ({
  date: '2026-10-22',
  description: 'ซื้อปุ๋ยสำหรับแปลงแตงกวา',
  lines: [
    { accountId: 'fertilizer-cost', debitSatang: 125050, creditSatang: 0 },
    { accountId: 'cash', debitSatang: 0, creditSatang: 125050 }
  ]
});

test('converts baht to integer satang without floating-point drift', () => {
  assert.equal(Core.toSatang('1250.50'), 125050);
  assert.equal(Core.toSatang(0.1 + 0.2), 30);
  assert.equal(Core.fromSatang(125050), 1250.5);
});

test('rejects negative, non-finite, and unsafe amounts', () => {
  assert.equal(Core.toSatang('-3'), null);
  assert.equal(Core.toSatang('NaN'), null);
  assert.equal(Core.toSatang(Number.MAX_VALUE), null);
});

test('accepts a balanced agriculture expense entry', () => {
  const result = Core.validateEntry(validEntry(), accountMap);
  assert.equal(result.valid, true);
  assert.equal(result.debitSatang, 125050);
  assert.equal(result.creditSatang, 125050);
});

test('rejects an unbalanced entry', () => {
  const entry = validEntry();
  entry.lines[1].creditSatang = 125049;
  const result = Core.validateEntry(entry, accountMap);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes('เท่ากัน')));
});

test('rejects a line with both debit and credit populated', () => {
  const entry = validEntry();
  entry.lines[0].creditSatang = 1;
  assert.equal(Core.validateEntry(entry, accountMap).valid, false);
});

test('rejects an inactive or unknown account', () => {
  const entry = validEntry();
  entry.lines[0].accountId = 'missing-account';
  assert.equal(Core.validateEntry(entry, accountMap).valid, false);
});

test('rejects an impossible calendar date', () => {
  const entry = validEntry();
  entry.date = '2026-02-30';
  assert.equal(Core.validateEntry(entry, accountMap).valid, false);
});

test('profit and per-account expense summary are derived from posted journal lines', () => {
  const entries = [validEntry(), {
    date: '2026-10-22', description: 'ขายผลผลิต', lines: [
      { accountId: 'cash', debitSatang: 300000, creditSatang: 0 },
      { accountId: 'farm-sales', debitSatang: 0, creditSatang: 300000 }
    ]
  }];
  const summary = Core.summarize(entries, accounts);
  assert.equal(summary.incomeSatang, 300000);
  assert.equal(summary.expenseSatang, 125050);
  assert.equal(summary.profitSatang, 174950);
  assert.equal(summary.entryCount, 2);
  assert.equal(summary.expenseItems[0].accountId, 'fertilizer-cost');
});

test('month keys and Thai local date are stable', () => {
  assert.equal(Core.monthKey('2026-10-22T23:15:00Z'), '2026-10');
  assert.equal(Core.localDateKey(new Date('2026-10-22T18:00:00Z')), '2026-10-23');
});
