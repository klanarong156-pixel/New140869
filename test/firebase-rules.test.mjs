import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from '@firebase/rules-unit-testing';

const rules = fs.readFileSync(new URL('../firebase.rules.json', import.meta.url), 'utf8');
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';
const [host, portText] = databaseHost.split(':');
const port = Number(portText || 9000);

const OWNER_UID = 'farm-owner';
const OTHER_UID = 'farm-other';
const OWNER_EMAIL = 'owner@example.com';
const OTHER_EMAIL = 'other@example.com';

const testEnv = await initializeTestEnvironment({
  projectId: 'smart-farm-platfor-rules-test',
  database: {
    rules,
    host,
    port
  }
});

const ownerPath = path => `users/${OWNER_UID}/${path}`;
const otherPath = path => `users/${OTHER_UID}/${path}`;

const validCropCycle = () => ({
  crop: 'แตงกวา',
  startDate: '2026-09-28',
  updatedAt: '2026-09-28T00:00:00.000Z'
});

const validCropPlots = () => ([
  {
    id: 'plot-main',
    name: 'แปลงหลัก',
    crop: 'แตงกวา',
    startDate: '2026-09-28',
    status: 'active',
    notes: 'แปลงทดสอบ Rules',
    updatedAt: '2026-09-28T00:00:00.000Z'
  },
  {
    id: 'plot-second',
    name: 'แปลงสอง',
    crop: 'พริก',
    startDate: '2026-09-20',
    status: 'paused',
    notes: '',
    updatedAt: '2026-09-28T00:00:00.000Z'
  }
]);

const validAiAdvisor = () => ({
  enabled: true,
  updatedAt: '2026-09-28T00:00:00.000Z',
  history: [
    {
      id: 'analysis-001',
      at: '2026-09-28T00:00:00.000Z',
      reason: 'sensor',
      summary: 'อุณหภูมิอยู่ในเกณฑ์ปกติ',
      findings: [
        {
          id: 'normal',
          severity: 'info',
          title: 'ฟาร์มอยู่ในเกณฑ์ปกติ',
          message: 'ยังไม่พบสัญญาณผิดปกติจากข้อมูลล่าสุด',
          advice: 'ติดตามข้อมูลต่อเนื่อง'
        }
      ]
    }
  ]
});

const validFinanceItem = (id = 'FIN-test-001') => ({
  id,
  type: 'expense',
  item: 'ค่าปุ๋ย',
  category: 'ปุ๋ย',
  amount: 1250.5,
  createdAt: '2026-09-28T00:00:00.000Z'
});

const validCucumberSale = (id = 'CUC-test-001') => ({
  id,
  date: '2026-09-28',
  totalWeight: 190,
  weights: { good: 180, sorted: 10, large: 0 },
  note: 'รายการทดสอบ',
  createdAt: '2026-09-28T00:00:00.000Z',
  entryMode: 'quick',
  totalIncome: 1900
});

const clone = value => JSON.parse(JSON.stringify(value));

function dbFor(uid = null) {
  const context = uid
    ? testEnv.authenticatedContext(uid, { email: uid === OWNER_UID ? OWNER_EMAIL : OTHER_EMAIL })
    : testEnv.unauthenticatedContext();
  return context.database();
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.database();
    await db.ref().set({
      users: {
        [OWNER_UID]: {
          farm: {
            cropCycle: validCropCycle(),
            cropPlots: validCropPlots(),
            aiAdvisor: validAiAdvisor()
          }
        },
        [OTHER_UID]: {
          farm: {
            cropCycle: validCropCycle(),
            cropPlots: validCropPlots(),
            aiAdvisor: validAiAdvisor()
          }
        }
      }
    });
  });
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// Anonymous and cross-user access.
test('anonymous cannot read Farm Data', async () => {
  const db = dbFor();
  await assertFails(db.ref(ownerPath('farm/cropCycle')).once('value'));
  await assertFails(db.ref(ownerPath('farm/cropPlots')).once('value'));
  await assertFails(db.ref(ownerPath('farm/aiAdvisor')).once('value'));
});

test('owner can read their Farm Data', async () => {
  const db = dbFor(OWNER_UID);
  await assertSucceeds(db.ref(ownerPath('farm/cropCycle')).once('value'));
  await assertSucceeds(db.ref(ownerPath('farm/cropPlots')).once('value'));
  await assertSucceeds(db.ref(ownerPath('farm/aiAdvisor')).once('value'));
});

test('another user cannot read or write the owner Farm Data', async () => {
  const db = dbFor(OTHER_UID);
  await assertFails(db.ref(ownerPath('farm/cropCycle')).once('value'));
  await assertFails(db.ref(ownerPath('farm/cropPlots')).set(validCropPlots()));
  await assertFails(db.ref(ownerPath('farm/aiAdvisor')).set(validAiAdvisor()));
});

// Valid snapshots matching the current client write paths.
test('owner can write a valid cropCycle snapshot', async () => {
  await assertSucceeds(dbFor(OWNER_UID).ref(ownerPath('farm/cropCycle')).set(validCropCycle()));
});

test('owner can write a valid cropPlots snapshot', async () => {
  await assertSucceeds(dbFor(OWNER_UID).ref(ownerPath('farm/cropPlots')).set(validCropPlots()));
});

test('owner can write a valid aiAdvisor snapshot with history and findings', async () => {
  await assertSucceeds(dbFor(OWNER_UID).ref(ownerPath('farm/aiAdvisor')).set(validAiAdvisor()));
});

test('owner can write and read a valid Finance item', async () => {
  const ref = dbFor(OWNER_UID).ref(ownerPath('finance/FIN-test-001'));
  await assertSucceeds(ref.set(validFinanceItem()));
  const snapshot = await assertSucceeds(ref.once('value'));
  assert.deepEqual(snapshot.val(), validFinanceItem());
});

test('another user cannot read or write the owner Finance item', async () => {
  const ref = dbFor(OTHER_UID).ref(ownerPath('finance/FIN-test-001'));
  await assertFails(ref.once('value'));
  await assertFails(ref.set(validFinanceItem()));
});

test('Finance rejects an item whose id does not match its key', async () => {
  const value = validFinanceItem('FIN-wrong-id');
  await assertFails(dbFor(OWNER_UID).ref(ownerPath('finance/FIN-test-002')).set(value));
});

test('owner can write and read a valid cucumber sale', async () => {
  const ref = dbFor(OWNER_UID).ref(ownerPath('cucumberSales/CUC-test-001'));
  await assertSucceeds(ref.set(validCucumberSale()));
  const snapshot = await assertSucceeds(ref.once('value'));
  assert.deepEqual(snapshot.val(), validCucumberSale());
});

test('another user cannot read or write the owner cucumber sale', async () => {
  const ref = dbFor(OTHER_UID).ref(ownerPath('cucumberSales/CUC-test-001'));
  await assertFails(ref.once('value'));
  await assertFails(ref.set(validCucumberSale()));
});

test('cucumber sales rejects an item whose id does not match its key', async () => {
  await assertFails(
    dbFor(OWNER_UID).ref(ownerPath('cucumberSales/CUC-test-002')).set(validCucumberSale('CUC-wrong-id'))
  );
});

// Required-field validation.
test('cropCycle rejects a missing required field', async () => {
  const value = validCropCycle();
  delete value.crop;
  await assertFails(dbFor(OWNER_UID).ref(ownerPath('farm/cropCycle')).set(value));
});

test('cropPlots rejects a plot with a missing required field', async () => {
  const value = validCropPlots();
  delete value[0].notes;
  await assertFails(dbFor(OWNER_UID).ref(ownerPath('farm/cropPlots')).set(value));
});

test('aiAdvisor rejects a missing required top-level field', async () => {
  const value = validAiAdvisor();
  delete value.enabled;
  await assertFails(dbFor(OWNER_UID).ref(ownerPath('farm/aiAdvisor')).set(value));
});

test('aiAdvisor rejects a history entry missing summary', async () => {
  const value = validAiAdvisor();
  delete value.history[0].summary;
  await assertFails(dbFor(OWNER_UID).ref(ownerPath('farm/aiAdvisor')).set(value));
});

// Type and enum validation.
test('cropCycle rejects a non-string startDate', async () => {
  const value = validCropCycle();
  value.startDate = 20260928;
  await assertFails(dbFor(OWNER_UID).ref(ownerPath('farm/cropCycle')).set(value));
});

test('cropPlots rejects an invalid status type/value', async () => {
  const value = validCropPlots();
  value[0].status = true;
  await assertFails(dbFor(OWNER_UID).ref(ownerPath('farm/cropPlots')).set(value));
});

test('aiAdvisor rejects a non-string updatedAt', async () => {
  const value = validAiAdvisor();
  value.updatedAt = Date.now();
  await assertFails(dbFor(OWNER_UID).ref(ownerPath('farm/aiAdvisor')).set(value));
});

test('aiAdvisor rejects an invalid finding severity', async () => {
  const value = validAiAdvisor();
  value.history[0].findings[0].severity = 'emergency';
  await assertFails(dbFor(OWNER_UID).ref(ownerPath('farm/aiAdvisor')).set(value));
});

// Unknown field/path validation.
test('cropCycle rejects an unknown field', async () => {
  const value = validCropCycle();
  value.isAdmin = true;
  await assertFails(dbFor(OWNER_UID).ref(ownerPath('farm/cropCycle')).set(value));
});

test('cropPlots rejects an unknown field inside a plot', async () => {
  const value = validCropPlots();
  value[0].secret = 'must-not-be-stored';
  await assertFails(dbFor(OWNER_UID).ref(ownerPath('farm/cropPlots')).set(value));
});

test('aiAdvisor rejects an unknown top-level field', async () => {
  const value = validAiAdvisor();
  value.apiKey = 'must-not-be-stored';
  await assertFails(dbFor(OWNER_UID).ref(ownerPath('farm/aiAdvisor')).set(value));
});

test('aiAdvisor rejects an unknown finding field', async () => {
  const value = validAiAdvisor();
  value.history[0].findings[0].internalNote = 'must-not-be-stored';
  await assertFails(dbFor(OWNER_UID).ref(ownerPath('farm/aiAdvisor')).set(value));
});

test('owner cannot write an unknown Farm Data path', async () => {
  await assertFails(
    dbFor(OWNER_UID)
      .ref(ownerPath('farm/privateNotes'))
      .set({ note: 'must-not-be-stored' })
  );
});

// The other user may use their own path, but not the owner's path.
test('another user can write their own valid cropCycle but not the owner path', async () => {
  await assertSucceeds(dbFor(OTHER_UID).ref(otherPath('farm/cropCycle')).set(validCropCycle()));
  await assertFails(dbFor(OTHER_UID).ref(ownerPath('farm/cropCycle')).set(validCropCycle()));
});

let failures = 0;
try {
  await seed();
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`PASS ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${name}`);
      console.error(error?.stack || error);
    }
  }
} finally {
  await testEnv.cleanup();
}

if (failures > 0) {
  console.error(`\nFirebase Farm Data Rules tests: ${failures} failed`);
  process.exit(1);
}

console.log(`\nFirebase Farm Data Rules tests: ${tests.length} passed`);
