(function () {
  'use strict';

  let items = [];
  const $ = id => document.getElementById(id);
  const formatter = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 2 });
  const typeMeta = {
    income: { label: 'รายรับ', className: 'success', sign: '+' },
    expense: { label: 'รายจ่าย', className: 'danger', sign: '−' },
    pending: { label: 'ค้างซื้อ', className: 'warn', sign: '◌' }
  };

  function setText(id, value) { const element = $(id); if (element) element.textContent = value; }

  function summary() {
    return window.FinanceCore?.summary(items, 0) || { income: 0, expense: 0, pending: 0, profit: 0 };
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'ไม่ระบุวัน' : date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
  }

  function render() {
    const totals = summary();
    setText('financeIncome', formatter.format(totals.income));
    setText('financeExpense', formatter.format(totals.expense));
    setText('financePending', formatter.format(totals.pending));
    setText('financeProfit', formatter.format(totals.profit));
    setText('financeCount', `${items.length} รายการ`);
    const body = $('financeRows');
    const empty = $('financeEmpty');
    if (!body || !empty) return;
    body.innerHTML = '';
    empty.classList.toggle('hidden', items.length > 0);
    items.forEach(item => {
      const meta = typeMeta[item.type] || typeMeta.expense;
      const row = document.createElement('tr');
      row.innerHTML = `<td>${formatDate(item.createdAt)}</td><td><span class="tag ${meta.className}">${meta.label}</span></td><td><strong></strong></td><td><span class="finance-amount ${item.type}"></span></td><td><button class="btn danger small" type="button">ลบ</button></td>`;
      row.querySelector('strong').textContent = item.item;
      row.querySelector('.finance-amount').textContent = `${meta.sign} ${formatter.format(item.amount)}`;
      row.querySelector('button').addEventListener('click', () => remove(item.id, item.item));
      body.appendChild(row);
    });
  }

  async function refresh() {
    try {
      setText('financeLoadStatus', 'กำลังโหลดข้อมูล…');
      items = await loadFinanceItems();
      render();
      setText('financeLoadStatus', items.length ? `อัปเดตล่าสุด ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : 'ยังไม่มีรายการบันทึก');
    } catch (error) {
      console.error('Finance load failed:', error);
      items = [];
      render();
      setText('financeLoadStatus', 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่');
      window.showToast?.(error.message || 'โหลดข้อมูลการเงินไม่สำเร็จ', 'error');
    }
  }

  async function add(event) {
    event.preventDefault();
    const button = $('financeSubmit');
    const payload = { type: $('financeType').value, amount: $('financeAmount').value, item: $('financeItem').value };
    button.disabled = true;
    try {
      const saved = await saveFinanceItem(payload);
      items.unshift(saved);
      render();
      $('financeForm').reset();
      window.showToast?.('บันทึกรายการการเงินแล้ว', 'success');
      setText('financeLoadStatus', 'บันทึกสำเร็จ');
    } catch (error) {
      window.showToast?.(error.message || 'ไม่สามารถบันทึกรายการได้', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function remove(id, label) {
    if (!window.confirm(`ลบรายการ “${label}” หรือไม่?`)) return;
    try {
      await deleteFinanceItem(id);
      items = items.filter(item => item.id !== id);
      render();
      window.showToast?.('ลบรายการแล้ว', 'success');
    } catch (error) {
      window.showToast?.(error.message || 'ลบรายการไม่สำเร็จ', 'error');
    }
  }

  function printReport() {
    const printable = window.open('', '_blank', 'noopener,noreferrer');
    if (!printable) {
      window.showToast?.('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต pop-up แล้วลองใหม่', 'warning');
      return;
    }
    const totals = summary();
    const rows = items.map(item => `<tr><td>${formatDate(item.createdAt)}</td><td>${typeMeta[item.type]?.label || item.type}</td><td>${item.item.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]))}</td><td style="text-align:right">${formatter.format(item.amount)}</td></tr>`).join('');
    printable.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>รายงานการเงิน · สวนลุงนะ</title><style>body{font-family:Tahoma,sans-serif;color:#17251b;padding:30px}h1{margin-bottom:4px}p{color:#56675b}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{padding:10px;border-bottom:1px solid #d9e4dc;text-align:left}th{background:#eff7f1}.totals{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:20px}.box{background:#f3f8f4;padding:12px;border-radius:8px}.box b{display:block;font-size:18px}@media print{body{padding:0}}</style></head><body><h1>รายงานการเงินฟาร์ม</h1><p>สวนลุงนะ Smart Farm · พิมพ์เมื่อ ${new Date().toLocaleString('th-TH')}</p><div class="totals"><div class="box">รายรับ<b>${formatter.format(totals.income)}</b></div><div class="box">รายจ่าย<b>${formatter.format(totals.expense)}</b></div><div class="box">ค้างซื้อ<b>${formatter.format(totals.pending)}</b></div><div class="box">กำไรสุทธิ<b>${formatter.format(totals.profit)}</b></div></div><table><thead><tr><th>วันที่</th><th>ประเภท</th><th>รายการ</th><th style="text-align:right">จำนวนเงิน</th></tr></thead><tbody>${rows || '<tr><td colspan="4">ไม่มีข้อมูล</td></tr>'}</tbody></table><script>window.onload=()=>window.print();<\/script></body></html>`);
    printable.document.close();
  }

  function boot() {
    $('financeForm')?.addEventListener('submit', add);
    $('financePrint')?.addEventListener('click', printReport);
    refresh();
  }

  window.addEventListener('access:ready', boot, { once: true });
})();
