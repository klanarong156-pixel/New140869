(() => {
  'use strict';
  const STORAGE_KEY = 'suanlungna.control-room.schedules.v1';
  const labels = { pump: 'ปั๊มน้ำ', zone1: 'Zone 1', lighthome: 'ไฟบ้าน', lightsala: 'ไฟศาลา' };
  const dayLabels = { mon: 'จ', tue: 'อ', wed: 'พ', thu: 'พฤ', fri: 'ศ', sat: 'ส', sun: 'อา' };
  const form = document.getElementById('scheduleForm');
  const list = document.getElementById('scheduleList');
  const count = document.getElementById('scheduleCount');
  if (!form || !list) return;
  let schedules = load();
  let toastTimer;
  const toast = message => {
    let node = document.querySelector('.toast');
    if (!node) return;
    node.textContent = message; node.classList.add('show'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 2600);
  };
  function load() { try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch (_) { return []; } }
  function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules)); }
  function days(value) { return (value || []).map(day => dayLabels[day] || day).join(' ') || 'ไม่เลือกวัน'; }
  function render() {
    count.textContent = `${schedules.length} รายการ`;
    if (!schedules.length) { list.innerHTML = '<div class="schedule-empty">ยังไม่มีตารางเวลา<br><small>สร้างรายการแรกจากแบบฟอร์มด้านซ้าย</small></div>'; return; }
    list.innerHTML = schedules.map(item => `<article class="schedule-item ${item.enabled ? '' : 'disabled'}" data-id="${item.id}"><div class="schedule-item-top"><div><span class="schedule-relay">${labels[item.relay] || item.relay}</span><strong>${item.onTime} <i>→</i> ${item.offTime}</strong></div><label class="mini-switch"><input type="checkbox" data-action="toggle" ${item.enabled ? 'checked' : ''}><span></span></label></div><div class="schedule-meta"><span>● ${days(item.days)}</span><span>${item.enabled ? 'กำลังใช้งาน' : 'ปิดใช้งาน'}</span></div><div class="schedule-actions"><button type="button" data-action="edit">แก้ไข</button><button type="button" data-action="delete">ลบ</button></div></article>`).join('');
  }
  function clearForm() { form.reset(); form.querySelectorAll('[name="day"]').forEach(input => { input.checked = true; }); form.elements.onTime.value = '06:00'; form.elements.offTime.value = '18:00'; form.elements.enabled.checked = true; delete form.dataset.editing; }
  function fill(item) { form.elements.relay.value = item.relay; form.elements.onTime.value = item.onTime; form.elements.offTime.value = item.offTime; form.elements.enabled.checked = item.enabled; form.querySelectorAll('[name="day"]').forEach(input => { input.checked = item.days.includes(input.value); }); form.dataset.editing = item.id; form.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form); const selectedDays = data.getAll('day');
    if (!selectedDays.length) { toast('กรุณาเลือกวันที่ทำงานอย่างน้อย 1 วัน'); return; }
    if (data.get('onTime') === data.get('offTime')) { toast('เวลาเปิดและเวลาปิดต้องไม่เท่ากัน'); return; }
    const record = { id: form.dataset.editing || `${Date.now()}-${Math.random().toString(16).slice(2)}`, relay: data.get('relay'), onTime: data.get('onTime'), offTime: data.get('offTime'), days: selectedDays, enabled: data.get('enabled') === 'on' };
    const index = schedules.findIndex(item => item.id === record.id);
    if (index >= 0) schedules[index] = record; else schedules.push(record);
    persist(); render(); clearForm(); toast('บันทึกตารางเวลาแล้ว · ยังเป็นโหมดทดสอบ UI');
  });
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-action]'); const item = event.target.closest('[data-id]');
    if (!button || !item) return;
    const index = schedules.findIndex(entry => entry.id === item.dataset.id); if (index < 0) return;
    const action = button.dataset.action;
    if (action === 'delete') { schedules.splice(index, 1); persist(); render(); toast('ลบตารางเวลาแล้ว'); }
    if (action === 'edit') fill(schedules[index]);
  });
  list.addEventListener('change', event => {
    if (event.target.dataset.action !== 'toggle') return;
    const item = event.target.closest('[data-id]'); const record = schedules.find(entry => entry.id === item?.dataset.id);
    if (!record) return; record.enabled = event.target.checked; persist(); render(); toast(record.enabled ? 'เปิดใช้งานตารางแล้ว' : 'ปิดใช้งานตารางแล้ว');
  });
  render();
})();
