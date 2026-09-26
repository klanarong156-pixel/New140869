(() => {
  'use strict';
  const STORAGE_KEY = 'suanlungna.control-room.schedules.v1';
  const labels = { pump: 'ปั๊มน้ำ', zone1: 'Zone 1', lighthome: 'ไฟบ้าน', lightsala: 'ไฟศาลา' };
  const dayLabels = { mon: 'จ', tue: 'อ', wed: 'พ', thu: 'พฤ', fri: 'ศ', sat: 'ส', sun: 'อา' };
  const allowedRelays = new Set(Object.keys(labels));
  const form = document.getElementById('scheduleForm');
  const list = document.getElementById('scheduleList');
  const count = document.getElementById('scheduleCount');
  const status = document.querySelector('[data-firebase-schedule-status]');
  if (!form || !list) return;
  let schedules = [];
  let toastTimer;
  let persistence = 'loading';
  const localCache = () => { try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch (_) { return []; } };
  const writeCache = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules)); } catch (_) {} };
  const user = () => window.FirebaseAuth?.user?.localId || '';
  const isFirebaseReady = () => Boolean(window.FirebaseDB && window.FirebaseAuth && user() && window.FirebaseAuth.token);
  const toast = message => { const node = document.querySelector('.toast'); if (!node) return; node.textContent = message; node.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 2800); };
  const setStatus = (kind, message) => { persistence = kind; if (status) { status.dataset.tone = kind; status.textContent = message; } };
  const days = value => (value || []).map(day => dayLabels[day] || day).join(' ') || 'ไม่เลือกวัน';
  const normalize = item => ({ id: String(item?.id || ''), relay: String(item?.relay || ''), onTime: String(item?.onTime || ''), offTime: String(item?.offTime || ''), days: Array.isArray(item?.days) ? item.days.filter(day => dayLabels[day]) : [], enabled: item?.enabled === true, updatedAt: String(item?.updatedAt || new Date().toISOString()) });
  const valid = item => item.id && allowedRelays.has(item.relay) && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.onTime) && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.offTime) && item.onTime !== item.offTime && item.days.length > 0;
  async function loadFirebase() {
    if (!isFirebaseReady()) { schedules = localCache().map(normalize).filter(valid); setStatus('offline', 'กรุณาเข้าสู่ระบบเพื่อซิงค์ข้ามอุปกรณ์'); render(); return; }
    try {
      const remote = await window.FirebaseDB.get('controlRoomSchedules');
      const values = remote && typeof remote === 'object' ? Object.values(remote).map(normalize).filter(valid) : [];
      const cached = localCache().map(normalize).filter(valid);
      if (!values.length && cached.length) { schedules = cached; await saveAll(); setStatus('cloud', 'ย้ายข้อมูลเดิมขึ้น Firebase แล้ว'); }
      else { schedules = values; writeCache(); setStatus('cloud', `ซิงค์ Firebase แล้ว · ${window.FirebaseAuth.user.email || 'บัญชีปัจจุบัน'}`); }
      render();
    } catch (error) { schedules = localCache().map(normalize).filter(valid); setStatus('offline', `Firebase ใช้งานไม่ได้ · ใช้ข้อมูลชั่วคราวในเครื่อง`); render(); toast(`โหลด Firebase ไม่สำเร็จ: ${error.message}`); }
  }
  async function saveAll() {
    if (!isFirebaseReady()) { writeCache(); setStatus('offline', 'ยังไม่ล็อกอิน · บันทึกไว้ชั่วคราวในเครื่อง'); return false; }
    const data = Object.fromEntries(schedules.map(item => [item.id, { ...item, updatedAt: new Date().toISOString() }]));
    await window.FirebaseDB.put('controlRoomSchedules', data);
    schedules = Object.values(data).map(normalize); writeCache(); setStatus('cloud', `บันทึก Firebase แล้ว · ${schedules.length} รายการ`); return true;
  }
  async function saveRecord(record) {
    if (!isFirebaseReady()) { writeCache(); setStatus('offline', 'ยังไม่ล็อกอิน · บันทึกไว้ชั่วคราวในเครื่อง'); return false; }
    const saved = { ...record, updatedAt: new Date().toISOString() };
    await window.FirebaseDB.put(`controlRoomSchedules/${encodeURIComponent(saved.id)}`, saved);
    const index = schedules.findIndex(item => item.id === saved.id);
    if (index >= 0) schedules[index] = normalize(saved); else schedules.push(normalize(saved));
    writeCache(); setStatus('cloud', `บันทึก Firebase แล้ว · ${schedules.length} รายการ`); return true;
  }
  async function deleteRecord(id) {
    if (!isFirebaseReady()) { writeCache(); setStatus('offline', 'ยังไม่ล็อกอิน · ลบเฉพาะข้อมูลในเครื่อง'); return false; }
    await window.FirebaseDB.delete(`controlRoomSchedules/${encodeURIComponent(id)}`);
    writeCache(); setStatus('cloud', `ลบจาก Firebase แล้ว · ${schedules.length} รายการ`); return true;
  }
  function render() {
    count.textContent = `${schedules.length} รายการ`;
    if (!schedules.length) { list.innerHTML = '<div class="schedule-empty">ยังไม่มีตารางเวลา<br><small>สร้างรายการแรกจากแบบฟอร์มด้านซ้าย</small></div>'; return; }
    list.innerHTML = schedules.map(item => `<article class="schedule-item ${item.enabled ? '' : 'disabled'}" data-id="${item.id}"><div class="schedule-item-top"><div><span class="schedule-relay">${labels[item.relay] || item.relay}</span><strong>${item.onTime} <i>→</i> ${item.offTime}</strong></div><label class="mini-switch"><input type="checkbox" data-action="toggle" ${item.enabled ? 'checked' : ''}><span></span></label></div><div class="schedule-meta"><span>● ${days(item.days)}</span><span>${item.enabled ? 'กำลังใช้งาน' : 'ปิดใช้งาน'}</span></div><div class="schedule-actions"><button type="button" data-action="edit">แก้ไข</button><button type="button" data-action="delete">ลบ</button></div></article>`).join('');
  }
  function clearForm() { form.reset(); form.querySelectorAll('[name="day"]').forEach(input => { input.checked = true; }); form.elements.onTime.value = '06:00'; form.elements.offTime.value = '18:00'; form.elements.enabled.checked = true; delete form.dataset.editing; }
  function fill(item) { form.elements.relay.value = item.relay; form.elements.onTime.value = item.onTime; form.elements.offTime.value = item.offTime; form.elements.enabled.checked = item.enabled; form.querySelectorAll('[name="day"]').forEach(input => { input.checked = item.days.includes(input.value); }); form.dataset.editing = item.id; form.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  form.addEventListener('submit', async event => {
    event.preventDefault(); const data = new FormData(form); const selectedDays = data.getAll('day');
    if (!selectedDays.length) { toast('กรุณาเลือกวันที่ทำงานอย่างน้อย 1 วัน'); return; }
    if (data.get('onTime') === data.get('offTime')) { toast('เวลาเปิดและเวลาปิดต้องไม่เท่ากัน'); return; }
    const record = normalize({ id: form.dataset.editing || `${Date.now()}-${Math.random().toString(16).slice(2)}`, relay: data.get('relay'), onTime: data.get('onTime'), offTime: data.get('offTime'), days: selectedDays, enabled: data.get('enabled') === 'on' });
    if (!valid(record)) { toast('ข้อมูลตารางเวลาไม่ถูกต้อง'); return; }
    const previous = [...schedules]; const index = schedules.findIndex(item => item.id === record.id); if (index >= 0) schedules[index] = record; else schedules.push(record); render();
    try { await saveRecord(record); clearForm(); toast(persistence === 'cloud' ? 'บันทึกลง Firebase แล้ว' : 'บันทึกชั่วคราวในเครื่อง · ต้องล็อกอินเพื่อซิงค์'); } catch (error) { schedules = previous; render(); toast(`บันทึก Firebase ไม่สำเร็จ: ${error.message}`); }
  });
  list.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]'); const item = event.target.closest('[data-id]'); if (!button || !item) return;
    const index = schedules.findIndex(entry => entry.id === item.dataset.id); if (index < 0) return;
    if (button.dataset.action === 'edit') { fill(schedules[index]); return; }
    if (button.dataset.action === 'delete') { const previous = [...schedules]; schedules.splice(index, 1); render(); try { await deleteRecord(item.dataset.id); toast(persistence === 'cloud' ? 'ลบจาก Firebase แล้ว' : 'ลบตารางเวลาแล้ว'); } catch (error) { schedules = previous; render(); toast(`ลบ Firebase ไม่สำเร็จ: ${error.message}`); } }
  });
  list.addEventListener('change', async event => {
    if (event.target.dataset.action !== 'toggle') return; const item = event.target.closest('[data-id]'); const record = schedules.find(entry => entry.id === item?.dataset.id); if (!record) return;
    const previous = record.enabled; record.enabled = event.target.checked; render(); try { await saveRecord(record); toast(record.enabled ? 'เปิดใช้งานและซิงค์แล้ว' : 'ปิดใช้งานและซิงค์แล้ว'); } catch (error) { record.enabled = previous; render(); toast(`ซิงค์ Firebase ไม่สำเร็จ: ${error.message}`); }
  });
  window.addEventListener('firebase:auth-expired', () => { setStatus('offline', 'Firebase session หมดอายุ · กรุณาเข้าสู่ระบบใหม่'); toast('Firebase session หมดอายุ'); });
  setStatus('loading', 'กำลังตรวจสอบ Firebase…'); loadFirebase();
})();
