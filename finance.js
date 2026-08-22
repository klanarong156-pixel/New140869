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
      row.innerHTML = `<td>${formatDate(item.createdAt)}</td><td><span class="tag ${meta.className}">${meta.label}</span></td><td class="finance-category"></td><td><strong></strong></td><td><span class="finance-amount ${item.type}"></span></td><td><button class="btn danger small" type="button">ลบ</button></td>`;
      row.querySelector('.finance-category').textContent = item.category || (item.type === 'income' ? '—' : 'ไม่ระบุ');
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
    const payload = { type: $('financeType').value, category: $('financeCostCategory')?.value || '', amount: $('financeAmount').value, item: $('financeItem').value };
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

  function printReportLegacy() {
    const printable = window.open('', '_blank', 'noopener,noreferrer');
    if (!printable) {
      window.showToast?.('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต pop-up แล้วลองใหม่', 'warning');
      return;
    }
    const totals = summary();
    const rows = items.map(item => `<tr><td>${formatDate(item.createdAt)}</td><td>${typeMeta[item.type]?.label || item.type}</td><td>${(item.category || (item.type === 'income' ? '—' : 'ไม่ระบุ')).replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]))}</td><td>${item.item.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]))}</td><td style="text-align:right">${formatter.format(item.amount)}</td></tr>`).join('');
    printable.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>รายงานการเงิน · สวนลุงนะ</title><style>body{font-family:Tahoma,sans-serif;color:#17251b;padding:30px}h1{margin-bottom:4px}p{color:#56675b}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{padding:10px;border-bottom:1px solid #d9e4dc;text-align:left}th{background:#eff7f1}.totals{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:20px}.box{background:#f3f8f4;padding:12px;border-radius:8px}.box b{display:block;font-size:18px}@media print{body{padding:0}}</style></head><body><h1>รายงานการเงินฟาร์ม</h1><p>สวนลุงนะ Smart Farm · พิมพ์เมื่อ ${new Date().toLocaleString('th-TH')}</p><div class="totals"><div class="box">รายรับ<b>${formatter.format(totals.income)}</b></div><div class="box">รายจ่าย<b>${formatter.format(totals.expense)}</b></div><div class="box">ค้างซื้อ<b>${formatter.format(totals.pending)}</b></div><div class="box">กำไรสุทธิ<b>${formatter.format(totals.profit)}</b></div></div><table><thead><tr><th>วันที่</th><th>ประเภท</th><th>หมวดต้นทุน</th><th>รายการ</th><th style="text-align:right">จำนวนเงิน</th></tr></thead><tbody>${rows || '<tr><td colspan="5">ไม่มีข้อมูล</td></tr>'}</tbody></table><script>window.onload=()=>window.print();<\/script></body></html>`);
    printable.document.close();
  }

  function printReport() {
    const JsPDF = window.jspdf?.jsPDF;
    if (!JsPDF) {
      window.showToast?.('ระบบ PDF ยังโหลดไม่เสร็จ กรุณาลองใหม่อีกครั้ง', 'warning');
      return printReportLegacy();
    }
    try {
      const doc = new JsPDF({ unit: 'mm', format: 'a4' });
      if (window.THAI_FONT_BASE64) {
        doc.addFileToVFS('NotoThai.ttf', window.THAI_FONT_BASE64);
        doc.addFont('NotoThai.ttf', 'NotoThai', 'normal');
        doc.setFont('NotoThai', 'normal');
      }
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const totals = summary();
      const thaiFont = window.THAI_FONT_BASE64 ? 'NotoThai' : 'helvetica';
      const setPdfFont = (font = thaiFont, size = 11) => { doc.setFont(font, 'normal'); doc.setFontSize(size); };
      const pdfNumber = value => `THB ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const pdfDate = value => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
        const get = type => parts.find(part => part.type === type)?.value || '';
        return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
      };
      let y = 18;
      setPdfFont(thaiFont, 18); doc.text('รายงานการเงินฟาร์ม', 14, y); y += 8;
      setPdfFont(thaiFont, 10); doc.text('สวนลุงนะ Smart Farm', 14, y); y += 8;
      const totalLine = (label, value) => {
        setPdfFont(thaiFont, 11); doc.text(`${label}:`, 14, y);
        setPdfFont('helvetica', 11); doc.text(pdfNumber(value), 62, y);
        y += 7;
      };
      totalLine('รายรับรวม', totals.income);
      totalLine('รายจ่ายรวม', totals.expense);
      totalLine('ค้างซื้อ', totals.pending);
      totalLine('กำไรสุทธิ', totals.profit);
      y += 3;
      setPdfFont(thaiFont, 10); doc.text('วันที่', 14, y); doc.text('ประเภท', 46, y); doc.text('หมวดต้นทุน', 72, y); doc.text('รายการ', 112, y); doc.text('จำนวนเงิน', pageWidth - 32, y); y += 3;
      doc.line(14, y, pageWidth - 14, y); y += 7;
      items.forEach(item => {
        if (y > pageHeight - 18) { doc.addPage(); y = 18; }
        const label = typeMeta[item.type]?.label || item.type;
        const category = doc.splitTextToSize(item.category || (item.type === 'income' ? '—' : 'ไม่ระบุ'), 35)[0];
        const name = doc.splitTextToSize(item.item, 40)[0];
        setPdfFont('helvetica', 9); doc.text(pdfDate(item.createdAt), 14, y, { maxWidth: 28 });
        setPdfFont(thaiFont, 9); doc.text(label, 46, y); doc.text(category, 72, y); doc.text(name, 112, y);
        setPdfFont('helvetica', 9); doc.text(pdfNumber(item.amount), pageWidth - 32, y);
        y += 7;
      });
      doc.save(`รายงานการเงิน-${new Date().toISOString().slice(0, 10)}.pdf`);
      window.showToast?.('ดาวน์โหลดรายงาน PDF แล้ว', 'success');
    } catch (error) {
      console.error('PDF export failed:', error);
      window.showToast?.('สร้าง PDF ไม่สำเร็จ กำลังเปิดหน้าพิมพ์แทน', 'warning');
      printReportLegacy();
    }
  }

  function boot() {
    $('financeForm')?.addEventListener('submit', add);
    $('financePrint')?.addEventListener('click', printReport);
    refresh();
  }

  window.addEventListener('access:ready', boot, { once: true });
})();
