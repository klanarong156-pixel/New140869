(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  function formatDate(value) {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? 'ไม่ระบุวันที่' : date.toLocaleDateString('th-TH', { dateStyle: 'long' });
  }
  async function load() {
    const name = $('dashboardCropName');
    const date = $('dashboardCropDate');
    const age = $('dashboardCropAge');
    const status = $('dashboardCropStatus');
    if (!name || !date || !age) return;
    try {
      const data = await window.cropCycle.load();
      if (!data.crop || !data.startDate) {
        name.textContent = 'ยังไม่ได้บันทึกรอบปลูก';
        date.textContent = 'ไปที่เมนูตั้งเวลาเพื่อเพิ่มข้อมูล';
        age.textContent = '—';
        if (status) status.textContent = 'ยังไม่มีข้อมูลรอบปลูก';
        return;
      }
      name.textContent = data.crop;
      date.textContent = `วันที่ปลูก ${formatDate(data.startDate)}`;
      age.textContent = `${window.cropCycle.age(data)} วัน`;
      if (status) status.textContent = 'คำนวณจากวันที่ปลูกถึงวันนี้';
    } catch (error) {
      name.textContent = 'ไม่สามารถโหลดข้อมูลได้';
      date.textContent = 'กรุณาลองใหม่อีกครั้ง';
      age.textContent = '—';
    }
  }
  window.addEventListener('access:ready', load, { once: true });
  if (document.readyState !== 'loading') load();
  else document.addEventListener('DOMContentLoaded', load, { once: true });
})();
