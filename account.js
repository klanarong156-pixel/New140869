(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const formatter = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 2 });
  const typeMeta = {
    income: { label: 'รายรับ', className: 'success', sign: '+' },
    expense: { label: 'รายจ่าย', className: 'danger', sign: '−' },
    pending: { label: 'ค้างซื้อ', className: 'warn', sign: '◌' }
  };
  let financeItems = [];

  function setText(id, value) { const element = $(id); if (element) element.textContent = value || '—'; }
  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'ไม่ระบุวัน' : date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
  }
  function renderFinance() {
    const totals = window.FinanceCore?.summary(financeItems, 0) || { income: 0, expense: 0, profit: 0 };
    setText('accountIncome', formatter.format(totals.income));
    setText('accountExpense', formatter.format(totals.expense));
    setText('accountProfit', formatter.format(totals.profit));
    const body = $('accountFinanceRows');
    const empty = $('accountFinanceEmpty');
    if (!body || !empty) return;
    body.replaceChildren();
    empty.classList.toggle('hidden', financeItems.length > 0);
    financeItems.forEach(item => {
      const meta = typeMeta[item.type] || typeMeta.expense;
      const row = document.createElement('tr');
      const dateCell = document.createElement('td'); dateCell.textContent = formatDate(item.createdAt);
      const typeCell = document.createElement('td');
      const tag = document.createElement('span'); tag.className = `tag ${meta.className}`; tag.textContent = meta.label; typeCell.appendChild(tag);
      const itemCell = document.createElement('td'); const itemName = document.createElement('strong'); itemName.textContent = item.item; itemCell.appendChild(itemName);
      const amountCell = document.createElement('td'); const amount = document.createElement('span'); amount.className = `finance-amount ${item.type}`; amount.textContent = `${meta.sign} ${formatter.format(item.amount)}`; amountCell.appendChild(amount);
      const actionCell = document.createElement('td'); const deleteButton = document.createElement('button'); deleteButton.className = 'btn danger small'; deleteButton.type = 'button'; deleteButton.textContent = 'ลบ'; deleteButton.addEventListener('click', () => removeFinance(item.id, item.item)); actionCell.appendChild(deleteButton);
      row.append(dateCell, typeCell, itemCell, amountCell, actionCell);
      body.appendChild(row);
    });
    setText('accountFinanceStatus', financeItems.length ? `${financeItems.length} รายการ · ข้อมูลล่าสุดจากบัญชีนี้` : 'ยังไม่มีรายการการเงิน');
  }
  async function loadFinance() {
    try {
      financeItems = await loadFinanceItems();
      renderFinance();
    } catch (error) {
      financeItems = [];
      renderFinance();
      setText('accountFinanceStatus', 'โหลดรายการการเงินไม่สำเร็จ');
      window.showToast?.(error.message || 'โหลดข้อมูลการเงินไม่สำเร็จ', 'error');
    }
  }
  async function removeFinance(id, label) {
    if (!window.confirm(`ลบรายการ “${label}” หรือไม่?`)) return;
    try {
      await deleteFinanceItem(id);
      financeItems = financeItems.filter(item => item.id !== id);
      renderFinance();
      window.showToast?.('ลบรายการแล้ว', 'success');
    } catch (error) {
      window.showToast?.(error.message || 'ลบรายการไม่สำเร็จ', 'error');
    }
  }
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
    loadFinance();
  }
  window.addEventListener('access:ready', boot, { once: true });
})();
