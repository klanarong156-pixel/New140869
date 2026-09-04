(function () {
  'use strict';

  const GRADES = Object.freeze(['good', 'sorted', 'large']);
  const GRADE_LABELS = Object.freeze({ good: 'เกรดดี', sorted: 'เกรดคัด', large: 'เกรดใหญ่' });
  const SALE_STATUSES = Object.freeze(['posted', 'cancelled']);
  let saveLock = false;

  const cleanText = (value, max = 160) => String(value ?? '').trim().slice(0, max);
  const number = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const money = value => Math.round((number(value) + Number.EPSILON) * 100) / 100;
  const id = prefix => `${prefix}-${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`;

  function normalizeGrades(grades = {}) {
    const result = {};
    GRADES.forEach(grade => {
      const weight = Math.max(0, number(grades[grade]?.weight));
      const price = Math.max(0, number(grades[grade]?.price));
      result[grade] = { weight, price, amount: money(weight * price) };
    });
    return result;
  }

  function validateSale(input) {
    const date = cleanText(input.date, 10);
    const customerId = cleanText(input.customerId, 80);
    const customerName = cleanText(input.customerName, 120);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('กรุณาเลือกวันที่ขายให้ถูกต้อง');
    if (!customerId || !customerName) throw new Error('กรุณาเลือกลูกค้า');
    const grades = normalizeGrades(input.grades);
    const totalWeight = money(GRADES.reduce((sum, grade) => sum + grades[grade].weight, 0));
    const totalAmount = money(GRADES.reduce((sum, grade) => sum + grades[grade].amount, 0));
    if (totalWeight <= 0) throw new Error('กรุณากรอกน้ำหนักแตงกวาอย่างน้อย 1 เกรด');
    if (GRADES.some(grade => grades[grade].weight > 0 && grades[grade].price < 0)) throw new Error('ราคาขายต้องไม่ติดลบ');
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
      const existing = input.id ? await FirebaseDB.get(`cucumberSales/${input.id}`) : null;
      const normalized = validateSale(input);
      const sale = {
        id: input.id || id('SALE'),
        ...normalized,
        status: input.status === 'cancelled' ? 'cancelled' : 'posted',
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        createdBy: existing?.createdBy || window.SMARTFARM_ACCESS?.user?.localId || '',
        accounting: { transactionId: accountingId(input.id || 'pending'), category: 'cucumber_sales', type: 'income', status: input.status === 'cancelled' ? 'cancelled' : 'posted' }
      };
      sale.accounting.transactionId = accountingId(sale.id);
      const account = buildAccounting(sale, now, existing?.accountingRecord || {});
      sale.accountingRecord = { createdAt: account.createdAt, createdBy: account.createdBy };
      await FirebaseDB.patch('', { cucumberSales: { [sale.id]: sale }, finance: { [account.id]: account } });
      return sale;
    } finally { saveLock = false; }
  }

  async function cancelSale(sale) {
    const now = new Date().toISOString();
    const current = await FirebaseDB.get(`cucumberSales/${sale.id}`);
    if (!current) throw new Error('ไม่พบรายการขาย');
    const accountId = accountingId(sale.id);
    const updates = {
      [`cucumberSales/${sale.id}/status`]: 'cancelled',
      [`cucumberSales/${sale.id}/updatedAt`]: now,
      [`cucumberSales/${sale.id}/accounting/status`]: 'cancelled',
      [`finance/${accountId}/status`]: 'cancelled',
      [`finance/${accountId}/updatedAt`]: now
    };
    await FirebaseDB.patch('', updates);
  }

  window.CucumberSales = { GRADES, GRADE_LABELS, SALE_STATUSES, loadCucumberData, saveCustomer, savePrices, saveSale, cancelSale, validateSale, accountingId };
})();
