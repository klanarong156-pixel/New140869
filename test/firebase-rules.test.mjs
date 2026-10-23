import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';

const rules = fs.readFileSync(new URL('../firebase.rules.json', import.meta.url), 'utf8');
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';
const [host, portText] = databaseHost.split(':');
const testEnv = await initializeTestEnvironment({
  projectId: 'agri-ledger-rules-test',
  database: { rules, host, port: Number(portText || 9000) }
});

const OWNER = 'account-owner';
const OTHER = 'different-owner';
const path = (uid, suffix) => `users/${uid}/${suffix}`;
const account = () => ({ id: 'user-5100', code: '5100', name: 'ค่าบรรจุภัณฑ์', type: 'expense', normalSide: 'debit', group: 'ต้นทุนการผลิต', active: true, system: false, createdAt: '2026-10-22T00:00:00.000Z' });
const entry = () => ({
  id: 'abcd1234ef567890', period: '2026-10', date: '2026-10-22', reference: 'AG-202610-A1B2C3', description: 'ซื้อถุงบรรจุ', crop: 'แตงกวา',
  lines: [
    { accountId: 'other-cost', debitSatang: 12500, creditSatang: 0, memo: '' },
    { accountId: 'cash', debitSatang: 0, creditSatang: 12500, memo: '' }
  ],
  debitTotalSatang: 12500, creditTotalSatang: 12500, status: 'posted', createdAt: '2026-10-22T00:00:00.000Z', createdBy: OWNER
});
const db = uid => testEnv.authenticatedContext(uid).database();

try {
  await testEnv.withSecurityRulesDisabled(async context => {
    await context.database().ref(path(OWNER, 'finance/FIN-old')).set({ id: 'FIN-old', type: 'income', item: 'ขายผลผลิต', amount: 500, createdAt: '2026-01-01T00:00:00.000Z' });
    await context.database().ref(path(OWNER, 'cucumberSales/CUC-old')).set({ id: 'CUC-old', date: '2026-01-01', totalWeight: 10 });
  });

  await assertSucceeds(db(OWNER).ref(path(OWNER, 'accounting/accounts/user-5100')).set(account()));
  await assertFails(db(OTHER).ref(path(OWNER, 'accounting/accounts/user-5100')).once('value'));
  await assertFails(db(OTHER).ref(path(OWNER, 'accounting/accounts/user-5101')).set({ ...account(), id: 'user-5101', code: '5101' }));

  const entryRef = db(OWNER).ref(path(OWNER, 'accounting/journals/2026-10/abcd1234ef567890'));
  await assertSucceeds(entryRef.set(entry()));
  await assertFails(entryRef.set(entry())); // Posted journals are immutable.
  await assertFails(entryRef.remove());
  await assertFails(db(OTHER).ref(path(OWNER, 'accounting/journals/2026-10/abcd1234ef567890')).once('value'));
  await assertFails(db(OTHER).ref(path(OWNER, 'accounting/journals/2026-10/otherentry0001')).set({ ...entry(), id: 'otherentry0001', createdBy: OTHER }));

  const unbalanced = entry(); unbalanced.creditTotalSatang = 12499;
  await assertFails(db(OWNER).ref(path(OWNER, 'accounting/journals/2026-10/unbalanced123')).set({ ...unbalanced, id: 'unbalanced123' }));
  const bothSides = entry(); bothSides.lines[0].creditSatang = 1;
  await assertFails(db(OWNER).ref(path(OWNER, 'accounting/journals/2026-10/bothsides1234')).set({ ...bothSides, id: 'bothsides1234' }));

  await assertSucceeds(db(OWNER).ref(path(OWNER, 'finance')).once('value'));
  await assertSucceeds(db(OWNER).ref(path(OWNER, 'cucumberSales')).once('value'));
  await assertFails(db(OWNER).ref(path(OWNER, 'finance/FIN-new')).set({ id: 'FIN-new' }));
  await assertFails(db(OWNER).ref(path(OWNER, 'cucumberSales/CUC-new')).set({ id: 'CUC-new' }));
  await assertFails(db(OTHER).ref(path(OWNER, 'finance')).once('value'));

  console.log('Firebase accounting rules: PASS');
} finally {
  await testEnv.cleanup();
}
