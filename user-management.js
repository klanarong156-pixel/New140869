(() => {
  'use strict';

  const state = { users: [], filtered: [] };
  const $ = id => document.getElementById(id);
  const esc = value => String(value || '');

  function setStatus(message, type = '') {
    const element = $('userManagementStatus');
    if (!element) return;
    element.textContent = message;
    element.className = `notice ${type}`;
  }

  async function callFunction(name, data = {}) {
    const config = window.FIREBASE_CONFIG || {};
    if (!config.projectId || !config.functionsRegion) throw new Error('ยังไม่ได้ตั้งค่า Firebase Functions');
    const endpoint = `https://${config.functionsRegion}-${config.projectId}.cloudfunctions.net/${name}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FirebaseAuth.token}` },
      body: JSON.stringify({ data })
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 && await FirebaseAuth.refresh()) return callFunction(name, data);
    if (!response.ok || payload.error) throw new Error(payload.error?.message || `เรียก ${name} ไม่สำเร็จ`);
    return payload.result;
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function render() {
    const body = $('userRows');
    const empty = $('userEmpty');
    if (!body) return;
    body.replaceChildren();
    state.filtered.forEach(user => {
      const row = document.createElement('tr');
      const identity = document.createElement('td');
      const email = document.createElement('strong'); email.textContent = user.email || '(ไม่มี email)';
      const uid = document.createElement('small'); uid.textContent = user.uid;
      identity.append(email, uid);
      const status = document.createElement('td');
      const statusTag = document.createElement('span'); statusTag.className = `tag ${user.disabled ? 'danger' : 'success'}`; statusTag.textContent = user.disabled ? 'ระงับใช้งาน' : 'ใช้งานอยู่';
      status.appendChild(statusTag);
      const roleCell = document.createElement('td');
      const role = document.createElement('select'); role.setAttribute('aria-label', `บทบาท ${user.email || user.uid}`);
      [['user', 'ผู้ใช้งานฟาร์ม'], ['admin', 'ผู้ดูแลระบบ']].forEach(([value, label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; option.selected = user.role === value; role.appendChild(option); });
      role.addEventListener('change', () => updateRole(user, role));
      roleCell.appendChild(role);
      const dates = document.createElement('td'); dates.textContent = `สร้าง ${formatDate(user.createdAt)}\nเข้าใช้ล่าสุด ${formatDate(user.lastSignInAt)}`; dates.style.whiteSpace = 'pre-line';
      const actions = document.createElement('td'); actions.className = 'user-actions';
      const reset = document.createElement('button'); reset.className = 'btn ghost small'; reset.type = 'button'; reset.textContent = 'รีเซ็ตรหัสผ่าน'; reset.addEventListener('click', () => resetPassword(user));
      const toggle = document.createElement('button'); toggle.className = `btn ${user.disabled ? 'secondary' : 'ghost'} small`; toggle.type = 'button'; toggle.textContent = user.disabled ? 'เปิดใช้งาน' : 'ระงับ'; toggle.addEventListener('click', () => toggleDisabled(user));
      const remove = document.createElement('button'); remove.className = 'btn danger small'; remove.type = 'button'; remove.textContent = 'ลบ'; remove.addEventListener('click', () => removeUser(user));
      actions.append(reset, toggle, remove);
      row.append(identity, status, roleCell, dates, actions);
      body.appendChild(row);
    });
    empty?.classList.toggle('hidden', state.filtered.length > 0);
    const count = $('userCount'); if (count) count.textContent = `${state.filtered.length}/${state.users.length} บัญชี`;
  }

  function applyFilter() {
    const query = String($('userSearch')?.value || '').trim().toLowerCase();
    state.filtered = state.users.filter(user => !query || [user.email, user.uid, user.displayName, user.role].some(value => esc(value).toLowerCase().includes(query)));
    render();
  }

  async function loadUsers() {
    setStatus('กำลังโหลดบัญชีผู้ใช้…');
    $('refreshUsers')?.setAttribute('disabled', 'disabled');
    try {
      const result = await callFunction('listUsers');
      state.users = Array.isArray(result?.users) ? result.users : [];
      applyFilter();
      setStatus(`โหลด ${state.users.length} บัญชีแล้ว`, 'success');
    } catch (error) {
      setStatus(error.message || 'โหลดบัญชีไม่สำเร็จ', 'danger');
    } finally { $('refreshUsers')?.removeAttribute('disabled'); }
  }

  async function updateRole(user, select) {
    const nextRole = select.value;
    if (!window.confirm(`ยืนยันเปลี่ยน ${user.email || user.uid} เป็น${nextRole === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งานฟาร์ม'}?`)) { select.value = user.role; return; }
    select.disabled = true;
    try { await callFunction('setUserRole', { uid: user.uid, role: nextRole }); user.role = nextRole; setStatus('เปลี่ยนบทบาทผู้ใช้แล้ว', 'success'); }
    catch (error) { select.value = user.role; setStatus(error.message || 'เปลี่ยนบทบาทไม่สำเร็จ', 'danger'); }
    finally { select.disabled = false; }
  }

  async function toggleDisabled(user) {
    const action = user.disabled ? 'เปิดใช้งาน' : 'ระงับ';
    if (!window.confirm(`ยืนยัน${action}บัญชี ${user.email || user.uid}?`)) return;
    try { const result = await callFunction('setUserDisabled', { uid: user.uid, disabled: !user.disabled }); user.disabled = Boolean(result.disabled); render(); setStatus(`${action}บัญชีแล้ว`, 'success'); }
    catch (error) { setStatus(error.message || `${action}บัญชีไม่สำเร็จ`, 'danger'); }
  }

  async function resetPassword(user) {
    if (!window.confirm(`สร้างลิงก์รีเซ็ตรหัสผ่านสำหรับ ${user.email || user.uid}?`)) return;
    try {
      const result = await callFunction('createPasswordResetLink', { uid: user.uid });
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(result.link);
      window.prompt('ลิงก์รีเซ็ตรหัสผ่าน (คัดลอกไว้แล้วถ้าเบราว์เซอร์อนุญาต)', result.link);
      setStatus(`สร้างลิงก์รีเซ็ตสำหรับ ${result.email} แล้ว`, 'success');
    } catch (error) { setStatus(error.message || 'สร้างลิงก์รีเซ็ตไม่สำเร็จ', 'danger'); }
  }

  async function removeUser(user) {
    if (!window.confirm(`ยืนยันลบบัญชี ${user.email || user.uid}?\nการลบไม่สามารถย้อนกลับได้`)) return;
    try { await callFunction('deleteUser', { uid: user.uid }); state.users = state.users.filter(item => item.uid !== user.uid); applyFilter(); setStatus('ลบบัญชีแล้ว', 'success'); }
    catch (error) { setStatus(error.message || 'ลบบัญชีไม่สำเร็จ', 'danger'); }
  }

  function boot(event) {
    if (event.detail?.role !== 'admin') return;
    $('refreshUsers')?.addEventListener('click', loadUsers);
    $('userSearch')?.addEventListener('input', applyFilter);
    loadUsers();
  }

  window.addEventListener('access:ready', boot, { once: true });
})();
