(function () {
  'use strict';

  const GRADES = Object.freeze(['good', 'sorted', 'large']);
  const GRADE_LABELS = Object.freeze({ good: 'เกรดดี', sorted: 'เกรดคัด', large: 'เกรดใหญ่' });
  const SALE_STATUSES = Object.freeze(['posted', 'cancelled']);
  const INVALID_KEY = /[.#$/[\]]/;
  const RETRY_MAX_ATTEMPTS = 3;
  const RETRY_BASE_DELAY_MS = 250;
  let saveLock = false;

  const cleanText = (value, max = 160) => String(value ?? '').trim().slice(0, max);
  const number = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const money = value => Math.round((number(value) + Number.EPSILON) * 100) / 100;
  const id = prefix => `${prefix}-${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`;

  function validateKey(value, label, max = 100) {
    const key = String(value ?? '').trim();
    if (!key || key.length > max || INVALID_KEY.test(key)) throw new Error(`${label}ไม่ถูกต้อง`);
    return key;
  }

  function isRetryableError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return /\bhttp\s+5\d{2}\b/.test(message)
      || message.includes('timeout')
      || message.includes('network error')
      || message.includes('networkerror')
      || message.includes('failed to fetch')
      || message.includes('fetch failed');
  }

  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  async function withRetry(operation) {
    let lastError;
    for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (!isRetryableError(error) || attempt === RETRY_MAX_ATTEMPTS) throw error;
        await wait(RETRY_BASE_DELAY_MS * (2 ** (attempt - 1)));
      }
    }
    throw lastError;
  }

  function normalizeGrades(grades = {}) {
    const result = {};
    GRADES.forEach(grade => {
      const rawWeight = grades[grade]?.weight ?? 0;
      const rawPrice = grades[grade]?.price ?? 0;
      const weight = number(rawWeight);
      const price = number(rawPrice);
      if (!Number.isFinite(Number(rawWeight)) || !Number.isFinite(Number(rawPrice))) throw new Error('น้ำหนักและราคาต้องเป็นตัวเลข');
      if (weight < 0) throw new Error('น้ำหนักแตงกวาต้องไม่ติดลบ');
      if (price < 0) throw new Error('ราคาขายต้องไม่ติดลบ');
      result[grade] = { weight, price, amount: money(weight * price) };
    });
    return result;
  }

  function validateSale(input = {}) {
    const date = cleanText(input.date, 10);
    const customerId = cleanText(input.customerId, 80);
    const customerName = cleanText(input.customerName, 120);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('กรุณาเลือกวันที่ขายให้ถูกต้อง');
    if (!customerId || !customerName) throw new Error('กรุณาเลือกลูกค้า');
    const grades = normalizeGrades(input.grades);
    const totalWeight = money(GRADES.reduce((sum, grade) => sum + grades[grade].weight, 0));
    const totalAmount = money(GRADES.reduce((sum, grade) => sum + grades[grade].amount, 0));
    if (totalWeight <= 0) throw new Error('กรุณากรอกน้ำหนักแตงกวาอย่างน้อย 1 เกรด');
    return { date, customerId, customerName, grades, totalWeight, totalAmount };
  }

  function accountingId(saleId) { return `CUCUMBER-INCOME-${saleId}`; }

  function buildAccounting(sale, now, existing = {}) {
    return {
      id: accountingId(sale.id),
      type: 'income',
      category: 'การขายแตงกวา',
      source: 'cucumber_sales',
      sourceId: sale.id,
      item: `ขายแตงกวาให้ ${sale.customerName}`,
      description: `ขายแตงกวา 3 เกรดให้ ${sale.customerName}`,
      customerId: sale.customerId,
      customerName: sale.customerName,
      amount: sale.totalAmount,
      date: sale.date,
      status: sale.status === 'cancelled' ? 'cancelled' : 'posted',
      createdAt: existing.createdAt || now,
      updatedAt: now,
      createdBy: existing.createdBy || window.SMARTFARM_ACCESS?.user?.localId || ''
    };
  }

  async function loadCucumberData() {
    const [sales, customers, prices, finance] = await Promise.all([
      FirebaseDB.get('cucumberSales'),
      FirebaseDB.get('customers'),
      FirebaseDB.get('cucumberPrices'),
      FirebaseDB.get('finance')
    ]);
    return {
      sales: sales ? Object.entries(sales).map(([key, value]) => ({ id: key, ...value })) : [],
      customers: customers ? Object.entries(customers).map(([key, value]) => ({ id: key, ...value })) : [],
      prices: prices || {},
      finance: finance ? Object.entries(finance).map(([key, value]) => ({ id: key, ...value })) : []
    };
  }

  async function saveCustomer(input) {
    const name = cleanText(input.name, 120);
    if (!name) throw new Error('กรุณากรอกชื่อลูกค้า');
    const customer = { id: input.id || id('CUS'), name, phone: cleanText(input.phone, 40), note: cleanText(input.note, 200), updatedAt: new Date().toISOString() };
    if (!input.id) customer.createdAt = customer.updatedAt;
    await FirebaseDB.put(`customers/${customer.id}`, customer);
    return customer;
  }

  async function savePrices(input) {
    const prices = {};
    GRADES.forEach(grade => { prices[grade] = { price: money(Math.max(0, input[grade])), updatedAt: new Date().toISOString() }; });
    await FirebaseDB.put('cucumberPrices', prices);
    return prices;
  }

  async function saveSale(input) {
    if (saveLock) throw new Error('กำลังบันทึกข้อมูล กรุณารอสักครู่');
    saveLock = true;
    try {
      const now = new Date().toISOString();
      const saleId = input.id ? validateKey(input.id, 'รหัสรายการขาย') : id('SALE');
      const existing = input.id ? await withRetry(() => FirebaseDB.get(`cucumberSales/${saleId}`)) : null;
      const existingAccount = input.id ? await withRetry(() => FirebaseDB.get(`finance/${accountingId(saleId)}`)) : null;
      if (input.id && !existing) throw new Error('ไม่พบรายการขายที่ต้องการแก้ไข');
      const normalized = validateSale(input);
      const sale = {
        id: saleId,
        ...normalized,
        status: input.status === 'cancelled' || existing?.status === 'cancelled' ? 'cancelled' : 'posted',
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        createdBy: existing?.createdBy || window.SMARTFARM_ACCESS?.user?.localId || '',
        accounting: { transactionId: accountingId(saleId), category: 'cucumber_sales', type: 'income', status: input.status === 'cancelled' ? 'cancelled' : 'posted' }
      };
      sale.accounting.status = sale.status;
      const account = buildAccounting(sale, now, existingAccount || existing?.accountingRecord || {});
      sale.accountingRecord = { createdAt: account.createdAt, createdBy: account.createdBy };

      // Do not send { finance: { [account.id]: account } } at the user root.
      // Firebase treats that as a replacement of the whole finance collection.
      // Flattened child paths update only this sale and its linked accounting record.
      await withRetry(() => FirebaseDB.patch('', {
        [`cucumberSales/${sale.id}`]: sale,
        [`finance/${account.id}`]: account
      }));
      return sale;
    } finally { saveLock = false; }
  }

  async function cancelSale(sale) {
    const saleId = validateKey(sale?.id, 'รหัสรายการขาย');
    const now = new Date().toISOString();
    const current = await FirebaseDB.get(`cucumberSales/${saleId}`);
    if (!current) throw new Error('ไม่พบรายการขาย');
    const accountId = accountingId(saleId);
    const updates = {
      [`cucumberSales/${saleId}/status`]: 'cancelled',
      [`cucumberSales/${saleId}/updatedAt`]: now,
      [`cucumberSales/${saleId}/accounting/status`]: 'cancelled'
    };
    // An older sale may have lost its finance row because of the old overwrite bug.
    // Do not create an invalid partial finance row when there is nothing to cancel.
    const account = await FirebaseDB.get(`finance/${accountId}`);
    if (account) {
      updates[`finance/${accountId}/status`] = 'cancelled';
      updates[`finance/${accountId}/updatedAt`] = now;
    }
    await FirebaseDB.patch('', updates);
    return { ...current, status: 'cancelled', updatedAt: now, accounting: { ...(current.accounting || {}), status: 'cancelled' } };
  }

  async function deleteSale(sale) {
    const saleId = validateKey(sale?.id, 'รหัสรายการขาย');
    const current = await FirebaseDB.get(`cucumberSales/${saleId}`);
    if (!current) throw new Error('ไม่พบรายการขาย');
    const accountId = accountingId(saleId);
    const updates = { [`cucumberSales/${saleId}`]: null };
    const account = await FirebaseDB.get(`finance/${accountId}`);
    if (account !== null) updates[`finance/${accountId}`] = null;
    await FirebaseDB.patch('', updates);
    const [remainingSale, remainingAccount] = await Promise.all([
      FirebaseDB.get(`cucumberSales/${saleId}`),
      FirebaseDB.get(`finance/${accountId}`)
    ]);
    if (remainingSale !== null || remainingAccount !== null) throw new Error('Firebase ยังไม่ยืนยันการลบรายการ กรุณาลองใหม่');
  }

  window.CucumberSales = { GRADES, GRADE_LABELS, SALE_STATUSES, loadCucumberData, saveCustomer, savePrices, saveSale, cancelSale, deleteSale, validateSale, accountingId };
})();
