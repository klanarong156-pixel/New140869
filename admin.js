(function () {
  'use strict';
  const $ = id => document.getElementById(id);

  function setStatus(message, type = '') {
    const status = $('adminStatus');
    if (!status) return;
    status.textContent = message;
    status.className = `notice ${type}`;
  }

  async function loadRoles() {
    setStatus('กำลังโหลดรายชื่อผู้ใช้…');
    const body = $('roleRows');
    body.replaceChildren();
    try {
      const roles = await FirebaseRoot.get('roles') || {};
      const entries = Object.entries(roles).sort(([, a], [, b]) => String(a.email || '').localeCompare(String(b.email || '')));
      if (!entries.length) {
        $('roleEmpty').classList.remove('hidden');
        setStatus('ยังไม่มี role record ที่แสดงได้', 'warning');
        return;
      }
      $('roleEmpty').classList.add('hidden');
      entries.forEach(([uid, record]) => {
        const row = document.createElement('tr');
        const email = document.createElement('td'); email.textContent = record.email || uid;
        const uidCell = document.createElement('td'); uidCell.textContent = uid;
        const role = document.createElement('td');
        const select = document.createElement('select');
        ['user', 'admin'].forEach(value => { const option = document.createElement('option'); option.value = value; option.textContent = value === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งานฟาร์ม'; option.selected = record.role === value; select.appendChild(option); });
        select.addEventListener('change', () => changeRole(uid, record, select));
        role.appendChild(select);
        row.append(email, uidCell, role);
        body.appendChild(row);
      });
      setStatus(`โหลด ${entries.length} บัญชีแล้ว`, 'success');
    } catch (error) {
      setStatus(error.message || 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ', 'danger');
      window.showToast?.(error.message || 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ', 'error');
    }
  }

  async function changeRole(uid, record, select) {
    const selected = select.value;
    select.disabled = true;
    try {
      await FirebaseRoot.put(`roles/${uid}`, { ...record, role: selected, updatedAt: new Date().toISOString() });
      window.showToast?.('ปรับบทบาทผู้ใช้แล้ว', 'success');
    } catch (error) {
      select.value = record.role || 'user';
      window.showToast?.(error.message || 'ปรับบทบาทไม่สำเร็จ', 'error');
    } finally {
      select.disabled = false;
    }
  }

  function boot(event) {
    if (event.detail?.role !== 'admin') {
      window.showToast?.('หน้านี้สำหรับผู้ดูแลระบบเท่านั้น', 'warning');
      window.setTimeout(() => location.replace('index.html'), 700);
      return;
    }
    loadRoles();
    $('refreshRoles')?.addEventListener('click', loadRoles);
  }

  window.addEventListener('access:ready', boot, { once: true });
})();
