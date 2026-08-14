(function () {
  'use strict';
  const $ = id => document.getElementById(id);

  function setText(id, value) { const element = $(id); if (element) element.textContent = value || '—'; }

  async function loadProfile(state) {
    const fallback = { displayName: state.user?.email?.split('@')[0] || '', farmName: 'สวนลุงนะ' };
    try {
      const profile = await FirebaseDB.get('profile') || {};
      $('displayName').value = profile.displayName || fallback.displayName;
      $('farmName').value = profile.farmName || fallback.farmName;
      setText('accountName', profile.displayName || fallback.displayName);
      setText('accountFarm', profile.farmName || fallback.farmName);
    } catch (error) {
      $('displayName').value = fallback.displayName;
      $('farmName').value = fallback.farmName;
      setText('accountName', fallback.displayName);
      setText('accountFarm', fallback.farmName);
      window.showToast?.('โหลดโปรไฟล์ไม่สำเร็จ สามารถบันทึกใหม่ได้', 'warning');
    }
  }

  async function save(event) {
    event.preventDefault();
    const button = $('profileSubmit');
    const displayName = $('displayName').value.trim();
    const farmName = $('farmName').value.trim();
    if (!displayName || !farmName) return window.showToast?.('กรอกชื่อผู้ใช้และชื่อฟาร์มให้ครบ', 'warning');
    button.disabled = true;
    try {
      await FirebaseDB.patch('profile', { displayName, farmName, updatedAt: new Date().toISOString() });
      setText('accountName', displayName);
      setText('accountFarm', farmName);
      window.showToast?.('บันทึกข้อมูลฟาร์มแล้ว', 'success');
    } catch (error) {
      window.showToast?.(error.message || 'บันทึกข้อมูลไม่สำเร็จ', 'error');
    } finally {
      button.disabled = false;
    }
  }

  function boot(event) {
    const state = event.detail || window.SMARTFARM_ACCESS;
    setText('accountEmail', state.user?.email);
    setText('accountRole', state.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งานฟาร์ม');
    document.querySelectorAll('[data-admin-only]').forEach(element => element.classList.toggle('hidden', state.role !== 'admin'));
    $('profileForm')?.addEventListener('submit', save);
    loadProfile(state);
  }

  window.addEventListener('access:ready', boot, { once: true });
})();
