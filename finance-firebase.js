(function () {
  'use strict';

  const TYPES = new Set(['income', 'expense', 'pending']);
  let saveLock = false;

  function generateFinanceId() {
    return `FIN-${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`;
  }

  function normalize(item) {
    const type = String(item?.type || '');
    const label = String(item?.item || '').trim();
    const amount = Number(item?.amount);
    if (!TYPES.has(type)) throw new Error('ประเภทรายการไม่ถูกต้อง');
    if (!label) throw new Error('กรุณาระบุชื่อรายการ');
    if (!Number.isFinite(amount) || amount < 0) throw new Error('จำนวนเงินต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
    return {
      id: item.id || generateFinanceId(),
      type,
      item: label.slice(0, 140),
      category: String(item.category || '').trim().slice(0, 80),
      amount,
      createdAt: item.createdAt || new Date().toISOString()
    };
  }

  async function saveFinanceItem(item) {
    if (saveLock) throw new Error('กำลังบันทึกข้อมูล กรุณารอสักครู่');
    saveLock = true;
    try {
      const data = normalize(item);
      await FirebaseDB.put(`finance/${data.id}`, data);
      return data;
    } finally {
      saveLock = false;
    }
  }

  async function loadFinanceItems(callback) {
    try {
      const data = await FirebaseDB.get('finance');
      const items = data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [];
      items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (typeof callback === 'function') callback(items);
      return items;
    } catch (error) {
      if (typeof callback === 'function') callback([]);
      throw error;
    }
  }

  async function deleteFinanceItem(id) {
    const key = String(id || '').trim();
    if (!key || key.includes('/') || key.includes('.') || key.includes('#') || key.includes('$') || key.includes('[') || key.includes(']')) throw new Error('รหัสรายการไม่ถูกต้อง');
    const path = `finance/${key}`;
    await FirebaseDB.delete(path);
    const remaining = await FirebaseDB.get(path);
    if (remaining !== null) throw new Error('Firebase ยังไม่ยืนยันการลบรายการ กรุณาลองใหม่');
  }

  window.saveFinanceItem = saveFinanceItem;
  window.loadFinanceItems = loadFinanceItems;
  window.deleteFinanceItem = deleteFinanceItem;
})();
