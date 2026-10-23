(function () {
  'use strict';

  const ROOT = 'accounting';
  const core = window.AccountingCore;

  function makeId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID().replace(/-/g, '');
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
  }

  function entryReference(date) {
    const period = String(date || core.localDateKey()).slice(0, 7).replace('-', '');
    return `AG-${period}-${makeId().slice(0, 6).toUpperCase()}`;
  }

  function objectValues(data) {
    return data && typeof data === 'object'
      ? Object.entries(data).map(([id, item]) => ({ id, ...item }))
      : [];
  }

  async function loadAccounts() {
    const saved = await FirebaseDB.get(`${ROOT}/accounts`);
    const standard = core.DEFAULT_ACCOUNTS.map(account => ({ ...account, active: true, system: true }));
    const custom = objectValues(saved).map(account => ({ ...account, system: false }));
    return [...standard, ...custom].sort((a, b) => String(a.code).localeCompare(String(b.code), 'en'));
  }

  async function saveAccount(account) {
    const id = String(account?.id || '').trim();
    if (!/^[a-z0-9-]{2,40}$/.test(id)) throw new Error('รหัสบัญชีไม่ถูกต้อง');
    const name = String(account.name || '').trim();
    const code = String(account.code || '').trim();
    if (!name || name.length > 80 || !/^\d{3,8}$/.test(code)) throw new Error('กรอกรหัสและชื่อบัญชีให้ถูกต้อง');
    if (!Object.prototype.hasOwnProperty.call(core.ACCOUNT_TYPES, account.type)) throw new Error('เลือกประเภทบัญชีให้ถูกต้อง');
    const record = {
      id, code, name, type: account.type,
      normalSide: ['liability', 'equity', 'income'].includes(account.type) ? 'credit' : 'debit',
      group: String(account.group || core.ACCOUNT_TYPES[account.type]).trim().slice(0, 60),
      active: true, system: false, createdAt: new Date().toISOString()
    };
    await FirebaseDB.put(`${ROOT}/accounts/${id}`, record);
    return record;
  }

  async function setAccountActive(account, active) {
    if (account.system) throw new Error('บัญชีมาตรฐานไม่สามารถปิดใช้งานได้');
    await FirebaseDB.patch(`${ROOT}/accounts/${account.id}`, { active: Boolean(active) });
  }

  async function loadMonth(period) {
    if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('ช่วงเดือนไม่ถูกต้อง');
    return objectValues(await FirebaseDB.get(`${ROOT}/journals/${period}`))
      .sort((a, b) => `${b.date || ''}${b.createdAt || ''}`.localeCompare(`${a.date || ''}${a.createdAt || ''}`));
  }

  async function loadYear(year) {
    const periods = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
    const groups = await Promise.all(periods.map(loadMonth));
    return groups.flat().sort((a, b) => `${b.date || ''}${b.createdAt || ''}`.localeCompare(`${a.date || ''}${a.createdAt || ''}`));
  }

  async function postEntry(entry, accounts) {
    const check = core.validateEntry(entry, new Map(accounts.map(account => [account.id, account])));
    if (!check.valid) throw new Error(check.errors.join(' · '));
    const period = entry.date.slice(0, 7);
    const id = makeId();
    const record = {
      id, period, date: entry.date, reference: entry.reference || entryReference(entry.date),
      description: String(entry.description).trim(), crop: String(entry.crop || '').trim().slice(0, 60),
      lines: entry.lines.map(line => ({
        accountId: line.accountId,
        debitSatang: Number(line.debitSatang) || 0,
        creditSatang: Number(line.creditSatang) || 0,
        memo: String(line.memo || '').trim().slice(0, 120)
      })),
      debitTotalSatang: check.debitSatang, creditTotalSatang: check.creditSatang,
      status: 'posted', createdAt: new Date().toISOString(), createdBy: FirebaseAuth.user?.localId || ''
    };
    await FirebaseDB.put(`${ROOT}/journals/${period}/${id}`, record);
    return record;
  }

  async function loadLegacyRecords() {
    const results = await Promise.allSettled([FirebaseDB.get('finance'), FirebaseDB.get('cucumberSales')]);
    return {
      finance: results[0].status === 'fulfilled' ? objectValues(results[0].value).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))) : [],
      sales: results[1].status === 'fulfilled' ? objectValues(results[1].value).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))) : [],
      financeError: results[0].status === 'rejected' ? results[0].reason : null,
      salesError: results[1].status === 'rejected' ? results[1].reason : null
    };
  }

  window.AccountingStore = Object.freeze({ makeId, entryReference, loadAccounts, saveAccount, setAccountActive, loadMonth, loadYear, postEntry, loadLegacyRecords });
})();
