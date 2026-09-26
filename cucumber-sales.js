(function () {
  'use strict';

  const GRADE_KEYS = Object.freeze(['good', 'sorted', 'large']);
  const GRADE_LABELS = Object.freeze({ good: 'เกรด A', sorted: 'เกรด B', large: 'เกรดใหญ่เดิม' });
  const FLAT_FIELDS = Object.freeze(['gradeAKg', 'gradeAPrice', 'gradeBKg', 'gradeBPrice']);
  let saveLock = false;

  function generateId() {
    return `CUC-${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`;
  }

  function hasValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
  }

  function round(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function numberValue(value, label, { required = false } = {}) {
    if (!hasValue(value)) {
      if (required) throw new Error(`${label}ต้องระบุ`);
      return 0;
    }
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${label}ต้องเป็นตัวเลข`);
    if (number < 0) throw new Error(`${label}ต้องไม่ติดลบ`);
    return round(number);
  }

  function isValidDateKey(value) {
    const date = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  }

  function isSafeId(value) {
    return /^[A-Za-z0-9_-]{1,64}$/.test(String(value || ''));
  }

  function isFlatSchema(record) {
    return FLAT_FIELDS.some(field => hasValue(record?.[field]));
  }

  function gradeValues(record) {
    const flat = record?.entryMode === 'graded' ? false : isFlatSchema(record);
    return {
      flat,
      good: flat ? numberValue(record?.gradeAKg, 'น้ำหนักเกรด A', { required: true }) : numberValue(record?.weights?.good, 'น้ำหนักเกรดดี'),
      sorted: flat ? numberValue(record?.gradeBKg, 'น้ำหนักเกรด B', { required: true }) : numberValue(record?.weights?.sorted, 'น้ำหนักเกรดคัด'),
      large: flat ? numberValue(record?.weights?.large ?? record?.gradeLargeKg, 'น้ำหนักเกรดใหญ่เดิม') : numberValue(record?.weights?.large, 'น้ำหนักเกรดใหญ่')
    };
  }

  function normalize(record) {
    const values = gradeValues(record);
    const totalWeight = hasValue(record?.totalWeight)
      ? numberValue(record.totalWeight, 'น้ำหนักรวม', { required: true })
      : round(values.good + values.sorted + values.large);
    const gradedEntry = record?.entryMode === 'graded';
    const quickEntry = hasValue(record?.totalIncome) && !isFlatSchema(record) && !gradedEntry;
    const gradePrices = gradedEntry ? {
      good: numberValue(record?.priceA ?? record?.prices?.good, 'ราคาเกรด A'),
      sorted: numberValue(record?.priceB ?? record?.prices?.sorted, 'ราคาเกรด B')
    } : null;
    const totalIncome = hasValue(record?.totalIncome) ? numberValue(record.totalIncome, 'เงินที่ได้รับ', { required: true }) : 0;
    const storedValues = quickEntry ? { ...values, good: totalWeight } : values;
    const gradeTotal = GRADE_KEYS.reduce((sum, key) => sum + storedValues[key], 0);
    const date = String(record?.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const createdAt = String(record?.createdAt || new Date().toISOString());

    if (!isValidDateKey(date)) throw new Error('วันที่ขายไม่ถูกต้อง');
    if (!Number.isFinite(totalWeight) || totalWeight <= 0) throw new Error('กรุณาระบุน้ำหนักรวมมากกว่า 0 กก.');
    if (gradeTotal <= 0) throw new Error('กรุณาระบุน้ำหนักอย่างน้อย 1 เกรด');
    if (Math.abs(totalWeight - gradeTotal) > 0.01) throw new Error('น้ำหนักแต่ละเกรดต้องรวมเท่ากับน้ำหนักรวม');
    if (Number.isNaN(new Date(createdAt).getTime())) throw new Error('เวลาบันทึกไม่ถูกต้อง');

    const id = String(record?.id || generateId());
    if (!isSafeId(id)) throw new Error('รหัสรายการไม่ถูกต้อง');

    const data = {
      id,
      date,
      totalWeight,
      weights: { good: storedValues.good, sorted: storedValues.sorted, large: storedValues.large },
      note: String(record?.note || '').trim().slice(0, 140),
      createdAt
    };
    if (quickEntry) { data.entryMode = 'quick'; data.totalIncome = totalIncome; }
    if (gradedEntry) { data.entryMode = 'graded'; data.prices = gradePrices; data.paymentStatus = record?.paymentStatus === 'paid' ? 'paid' : 'pending'; }

    if (values.flat) {
      data.gradeAKg = values.good;
      data.gradeAPrice = numberValue(record?.gradeAPrice, 'ราคากิโลกรัมเกรด A', { required: true });
      data.gradeBKg = values.sorted;
      data.gradeBPrice = numberValue(record?.gradeBPrice, 'ราคากิโลกรัมเกรด B', { required: true });
    }
    return data;
  }

  function calculate(record) {
    const values = gradeValues(record || {});
    const totalKg = hasValue(record?.totalWeight)
      ? numberValue(record.totalWeight, 'น้ำหนักรวม')
      : round(values.good + values.sorted + values.large);
    const gradedEntry = record?.entryMode === 'graded';
    const gradeAPrice = gradedEntry ? numberValue(record?.priceA ?? record?.prices?.good, 'ราคาเกรด A') : (values.flat ? numberValue(record?.gradeAPrice, 'ราคากิโลกรัมเกรด A') : 0);
    const gradeBPrice = gradedEntry ? numberValue(record?.priceB ?? record?.prices?.sorted, 'ราคาเกรด B') : (values.flat ? numberValue(record?.gradeBPrice, 'ราคากิโลกรัมเกรด B') : 0);
    const gradeAIncome = round(values.good * gradeAPrice);
    const gradeBIncome = round(values.sorted * gradeBPrice);
    const isQuick = record?.entryMode === 'quick' && hasValue(record?.totalIncome);
    return {
      gradeAKg: isQuick ? 0 : values.good,
      gradeAPrice,
      gradeAIncome,
      gradeBKg: isQuick ? 0 : values.sorted,
      gradeBPrice,
      gradeBIncome,
      legacyLargeKg: values.large,
      totalKg: round(totalKg),
      totalIncome: isQuick ? numberValue(record.totalIncome, 'เงินที่ได้รับ', { required: true }) : round(gradeAIncome + gradeBIncome)
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
    return items.sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')));
  }

  async function deleteCucumberSale(id) {
    const key = String(id || '').trim();
    if (!isSafeId(key)) throw new Error('รหัสรายการไม่ถูกต้อง');
    const path = `cucumberSales/${key}`;
    await FirebaseDB.delete(path);
    const remaining = await FirebaseDB.get(path);
    if (remaining !== null) throw new Error('Firebase ยังไม่ยืนยันการลบรายการ กรุณาลองใหม่');
  }

  window.CucumberSales = Object.freeze({
    GRADE_KEYS,
    GRADE_LABELS,
    normalize,
    calculate,
    save: saveCucumberSale,
    load: loadCucumberSales,
    remove: deleteCucumberSale
  });
})();
