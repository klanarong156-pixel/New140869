(function (root) {
  'use strict';

  const DEFAULT_ACCOUNTS = [
    { id: 'cash', code: '1010', name: 'เงินสดในมือ', type: 'asset', normalSide: 'debit', group: 'เงินสดและเงินฝาก' },
    { id: 'bank', code: '1020', name: 'เงินฝากธนาคาร', type: 'asset', normalSide: 'debit', group: 'เงินสดและเงินฝาก' },
    { id: 'receivable', code: '1100', name: 'ลูกหนี้การค้า', type: 'asset', normalSide: 'debit', group: 'ลูกหนี้และสินทรัพย์หมุนเวียน' },
    { id: 'inventory', code: '1200', name: 'วัสดุการเกษตรคงเหลือ', type: 'asset', normalSide: 'debit', group: 'ลูกหนี้และสินทรัพย์หมุนเวียน' },
    { id: 'equipment', code: '1500', name: 'เครื่องมือและอุปกรณ์การเกษตร', type: 'asset', normalSide: 'debit', group: 'สินทรัพย์ระยะยาว' },
    { id: 'payable', code: '2010', name: 'เจ้าหนี้การค้า', type: 'liability', normalSide: 'credit', group: 'หนี้สิน' },
    { id: 'loan', code: '2020', name: 'เงินกู้ยืม', type: 'liability', normalSide: 'credit', group: 'หนี้สิน' },
    { id: 'owner-equity', code: '3010', name: 'ทุนเจ้าของ', type: 'equity', normalSide: 'credit', group: 'ส่วนของเจ้าของ' },
    { id: 'farm-sales', code: '4010', name: 'รายได้ขายผลผลิต', type: 'income', normalSide: 'credit', group: 'รายได้' },
    { id: 'other-income', code: '4020', name: 'รายได้อื่น', type: 'income', normalSide: 'credit', group: 'รายได้' },
    { id: 'seed-cost', code: '5010', name: 'เมล็ดพันธุ์และต้นกล้า', type: 'expense', normalSide: 'debit', group: 'ต้นทุนการผลิต' },
    { id: 'fertilizer-cost', code: '5020', name: 'ปุ๋ยและวัสดุบำรุงดิน', type: 'expense', normalSide: 'debit', group: 'ต้นทุนการผลิต' },
    { id: 'crop-protection-cost', code: '5030', name: 'สารป้องกันและกำจัดศัตรูพืช', type: 'expense', normalSide: 'debit', group: 'ต้นทุนการผลิต' },
    { id: 'labor-cost', code: '5040', name: 'ค่าแรงงานเกษตร', type: 'expense', normalSide: 'debit', group: 'ต้นทุนการผลิต' },
    { id: 'water-cost', code: '5050', name: 'ค่าน้ำและชลประทาน', type: 'expense', normalSide: 'debit', group: 'ต้นทุนการผลิต' },
    { id: 'electricity-cost', code: '5060', name: 'ค่าไฟฟ้า', type: 'expense', normalSide: 'debit', group: 'ต้นทุนการผลิต' },
    { id: 'transport-cost', code: '5070', name: 'ค่าขนส่งผลผลิต', type: 'expense', normalSide: 'debit', group: 'ต้นทุนการผลิต' },
    { id: 'repair-cost', code: '5080', name: 'ค่าซ่อมแซมอุปกรณ์', type: 'expense', normalSide: 'debit', group: 'ต้นทุนการผลิต' },
    { id: 'other-cost', code: '5090', name: 'ค่าใช้จ่ายการเกษตรอื่น', type: 'expense', normalSide: 'debit', group: 'ต้นทุนการผลิต' }
  ];

  const ACCOUNT_TYPES = Object.freeze({
    asset: 'สินทรัพย์', liability: 'หนี้สิน', equity: 'ส่วนของเจ้าของ', income: 'รายได้', expense: 'ค่าใช้จ่าย'
  });

  function toSatang(value) {
    const number = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, '').trim());
    if (!Number.isFinite(number) || number < 0) return null;
    const satang = Math.round((number + Number.EPSILON) * 100);
    return Number.isSafeInteger(satang) ? satang : null;
  }

  function fromSatang(value) {
    const satang = Number(value);
    return Number.isSafeInteger(satang) ? satang / 100 : 0;
  }

  function localDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const get = type => parts.find(part => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function monthKey(date = new Date()) {
    if (typeof date === 'string' && /^\d{4}-\d{2}/.test(date)) return date.slice(0, 7);
    return localDateKey(date).slice(0, 7);
  }

  function isValidDateKey(value) {
    const date = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  }

  function validateEntry(entry, accountMap) {
    const errors = [];
    if (!entry || typeof entry !== 'object') return { valid: false, errors: ['ข้อมูลรายการไม่ถูกต้อง'] };
    if (!isValidDateKey(entry.date)) errors.push('ระบุวันที่ให้ถูกต้อง');
    if (!String(entry.description || '').trim()) errors.push('ระบุรายละเอียดรายการ');
    if (String(entry.description || '').trim().length > 180) errors.push('รายละเอียดต้องไม่เกิน 180 ตัวอักษร');
    if (!Array.isArray(entry.lines) || entry.lines.length < 2 || entry.lines.length > 20) {
      errors.push('รายการบัญชีต้องมี 2–20 บรรทัด');
      return { valid: false, errors };
    }

    let debit = 0;
    let credit = 0;
    entry.lines.forEach((line, index) => {
      const label = `บรรทัด ${index + 1}`;
      const account = accountMap instanceof Map ? accountMap.get(line.accountId) : accountMap?.[line.accountId];
      if (!account || account.active === false) errors.push(`${label}: เลือกบัญชีที่ใช้งานอยู่`);
      const d = Number(line.debitSatang);
      const c = Number(line.creditSatang);
      const dValid = Number.isSafeInteger(d) && d >= 0;
      const cValid = Number.isSafeInteger(c) && c >= 0;
      if (!dValid || !cValid || (d > 0) === (c > 0)) errors.push(`${label}: ใส่ยอดเดบิตหรือเครดิตเพียงด้านเดียว`);
      if (dValid) debit += d;
      if (cValid) credit += c;
    });
    if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit)) errors.push('ยอดรวมสูงเกินขีดจำกัด');
    if (debit <= 0 || credit <= 0 || debit !== credit) errors.push('ยอดเดบิตและเครดิตรวมต้องเท่ากันและมากกว่า 0');
    return { valid: errors.length === 0, errors, debitSatang: debit, creditSatang: credit };
  }

  function summarize(entries = [], accounts = DEFAULT_ACCOUNTS) {
    const accountsById = new Map(accounts.map(account => [account.id, account]));
    let incomeSatang = 0;
    let expenseSatang = 0;
    let cashInSatang = 0;
    let cashOutSatang = 0;
    const expenseByAccount = new Map();
    const accountBalances = new Map();

    for (const entry of entries) {
      for (const line of entry.lines || []) {
        const account = accountsById.get(line.accountId);
        if (!account) continue;
        const debit = Number(line.debitSatang) || 0;
        const credit = Number(line.creditSatang) || 0;
        const change = account.normalSide === 'credit' ? credit - debit : debit - credit;
        accountBalances.set(account.id, (accountBalances.get(account.id) || 0) + change);
        if (account.type === 'income') incomeSatang += credit - debit;
        if (account.type === 'expense') {
          const amount = debit - credit;
          expenseSatang += amount;
          expenseByAccount.set(account.id, (expenseByAccount.get(account.id) || 0) + amount);
        }
        if (account.id === 'cash' || account.id === 'bank') {
          cashInSatang += debit;
          cashOutSatang += credit;
        }
      }
    }

    const expenseItems = [...expenseByAccount.entries()]
      .map(([accountId, amountSatang]) => ({ account: accountsById.get(accountId), accountId, amountSatang }))
      .sort((a, b) => b.amountSatang - a.amountSatang);
    return {
      incomeSatang, expenseSatang, profitSatang: incomeSatang - expenseSatang,
      cashInSatang, cashOutSatang, cashMovementSatang: cashInSatang - cashOutSatang,
      entryCount: entries.length, expenseItems, accountBalances
    };
  }

  function accountBalance(account, entries = []) {
    let total = 0;
    for (const entry of entries) {
      for (const line of entry.lines || []) {
        if (line.accountId !== account.id) continue;
        const debit = Number(line.debitSatang) || 0;
        const credit = Number(line.creditSatang) || 0;
        total += account.normalSide === 'credit' ? credit - debit : debit - credit;
      }
    }
    return total;
  }

  const api = Object.freeze({ DEFAULT_ACCOUNTS, ACCOUNT_TYPES, toSatang, fromSatang, localDateKey, monthKey, isValidDateKey, validateEntry, summarize, accountBalance });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AccountingCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
