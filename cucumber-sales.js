(function () {
  'use strict';

  const GRADE_KEYS = Object.freeze(['good', 'sorted', 'large']);
  const GRADE_LABELS = Object.freeze({ good: 'เกรดดี', sorted: 'เกรดคัด', large: 'เกรดใหญ่' });
  let saveLock = false;

  function generateId() {
    return `CUC-${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`;
  }

  function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0;
  }

  function normalize(record) {
    const totalWeight = numberValue(record?.totalWeight);
    const weights = {
      good: numberValue(record?.weights?.good),
      sorted: numberValue(record?.weights?.sorted),
      large: numberValue(record?.weights?.large)
    };
    const gradeTotal = GRADE_KEYS.reduce((sum, key) => sum + weights[key], 0);
    if (totalWeight <= 0) throw new Error('กรุณาระบุน้ำหนักรวมมากกว่า 0 กก.');
    if (gradeTotal <= 0) throw new Error('กรุณาระบุน้ำหนักอย่างน้อย 1 เกรด');
    if (Math.abs(totalWeight - gradeTotal) > 0.01) {
      throw new Error('น้ำหนักแต่ละเกรดต้องรวมเท่ากับน้ำหนักรวม');
    }
    return {
      id: String(record?.id || generateId()),
      date: String(record?.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
      totalWeight,
      weights,
      note: String(record?.note || '').trim().slice(0, 140),
      createdAt: record?.createdAt || new Date().toISOString()
    };
  }

  async function saveCucumberSale(record) {
    if (saveLock) throw new Error('กำลังบันทึกข้อมูล กรุณารอสักครู่');
    saveLock = true;
    try {
      const data = normalize(record);
      await FirebaseDB.put(`cucumberSales/${data.id}`, data);
      return data;
    } finally {
      saveLock = false;
    }
  }

  async function loadCucumberSales() {
    const data = await FirebaseDB.get('cucumberSales');
    const items = data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [];
    return items.sort((a, b) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt)));
  }

  async function deleteCucumberSale(id) {
    const key = String(id || '').trim();
    if (!key || /[./#$\[\]]/.test(key)) throw new Error('รหัสรายการไม่ถูกต้อง');
    await FirebaseDB.delete(`cucumberSales/${key}`);
    const remaining = await FirebaseDB.get(`cucumberSales/${key}`);
    if (remaining !== null) throw new Error('Firebase ยังไม่ยืนยันการลบรายการ กรุณาลองใหม่');
  }

  window.CucumberSales = Object.freeze({
    GRADE_KEYS,
    GRADE_LABELS,
    normalize,
    save: saveCucumberSale,
    load: loadCucumberSales,
    remove: deleteCucumberSale
  });
})();
