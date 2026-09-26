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

  function monthKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' }).formatToParts(date);
    return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}`;
  }

  function currentMonthKey() {
    return monthKey(new Date().toISOString());
  }

  function monthlyItems() {
    const selected = $('financeReportMonth')?.value || currentMonthKey();
    return items.filter(item => monthKey(item.createdAt) === selected);
  }

  function renderMonthlyReport() {
    const picker = $('financeReportMonth');
    if (!picker) return;
    if (!picker.value) picker.value = currentMonthKey();
    const selected = picker.value;
    const selectedItems = monthlyItems();
    const totals = window.FinanceCore?.summary(selectedItems, 0) || { income: 0, expense: 0, pending: 0, profit: 0 };
    setText('monthlyIncome', formatter.format(totals.income));
    setText('monthlyExpense', formatter.format(totals.expense));
    setText('monthlyPending', formatter.format(totals.pending));
    setText('monthlyProfit', formatter.format(totals.profit));
    setText('monthlyTransactionCount', `${selectedItems.length} รายการ`);
    const status = $('monthlyReportStatus');
    if (status) status.textContent = `สรุปอัตโนมัติสำหรับ ${new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(`${selected}-01T00:00:00+07:00`))}`;
    const categories = new Map();
    selectedItems.filter(item => item.type === 'expense' || item.type === 'pending').forEach(item => {
      const category = item.category || 'ไม่ระบุหมวด';
      categories.set(category, (categories.get(category) || 0) + Number(item.amount || 0));
    });
    const categoryRows = $('monthlyCategoryRows');
    if (!categoryRows) return;
    categoryRows.replaceChildren();
    [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([category, amount]) => {
      const row = document.createElement('li');
      const label = document.createElement('span'); label.textContent = category;
      const value = document.createElement('strong'); value.textContent = formatter.format(amount);
      row.append(label, value); categoryRows.appendChild(row);
    });
    if (!categories.size) {
      const row = document.createElement('li'); row.textContent = 'ยังไม่มีรายจ่ายในเดือนนี้'; categoryRows.appendChild(row);
    }
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
    body.replaceChildren();
    empty.classList.toggle('hidden', items.length > 0);
    items.forEach(item => {
      const meta = typeMeta[item.type] || typeMeta.expense;
      const row = document.createElement('tr');
      const dateCell = document.createElement('td');
      dateCell.textContent = formatDate(item.createdAt);
      const typeCell = document.createElement('td');
      const tag = document.createElement('span');
      tag.className = `tag ${meta.className}`;
      tag.textContent = meta.label;
      typeCell.appendChild(tag);
      const categoryCell = document.createElement('td');
      categoryCell.className = 'finance-category';
      categoryCell.textContent = item.category || (item.type === 'income' ? '—' : 'ไม่ระบุ');
      const itemCell = document.createElement('td');
      const itemName = document.createElement('strong');
      itemName.textContent = item.item;
      itemCell.appendChild(itemName);
      const amountCell = document.createElement('td');
      const amount = document.createElement('span');
      amount.className = `finance-amount ${item.type}`;
      amount.textContent = `${meta.sign} ${formatter.format(item.amount)}`;
      amountCell.appendChild(amount);
      const actionCell = document.createElement('td');
      const deleteButton = document.createElement('button');
      deleteButton.className = 'btn danger small';
      deleteButton.type = 'button';
      deleteButton.textContent = 'ลบ';
      deleteButton.addEventListener('click', () => remove(item.id, item.item));
      actionCell.appendChild(deleteButton);
      row.append(dateCell, typeCell, categoryCell, itemCell, amountCell, actionCell);
      body.appendChild(row);
    });
    renderMonthlyReport();
  }

  async function refresh() {
    try {
      setText('financeLoadStatus', 'กำลังโหลดข้อมูล…');
      items = await loadFinanceItems();
      render();
      setText('financeLoadStatus', items.length ? `อัปเดตล่าสุด ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : 'ยังไม่มีรายการบันทึก');
    } catch (error) {
      console.error('Finance load failed:', error);
      // Keep the last successfully loaded snapshot. A transient auth/network
      // failure must not make existing records appear to have disappeared.
      render();
      $('financeEmpty')?.classList.add('hidden');
      const detail = error?.message || 'ไม่ทราบสาเหตุ';
      setText('financeLoadStatus', items.length
        ? `โหลดข้อมูลล่าสุดไม่สำเร็จ · แสดงข้อมูลเดิมอยู่ (${detail})`
        : `โหลดข้อมูลไม่สำเร็จ · ${detail}`);
      window.showToast?.(`โหลดข้อมูลการเงินไม่สำเร็จ: ${detail}`, 'error');
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
    const doc = printable.document;
    doc.open();
    doc.documentElement.lang = 'th';
    const meta = doc.createElement('meta');
    meta.setAttribute('charset', 'utf-8');
    const title = doc.createElement('title');
    title.textContent = 'รายงานการเงิน · สวนลุงนะ';
    const style = doc.createElement('style');
    style.textContent = 'body{font-family:Tahoma,sans-serif;color:#17251b;padding:30px}h1{margin-bottom:4px}p{color:#56675b}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{padding:10px;border-bottom:1px solid #d9e4dc;text-align:left}th{background:#eff7f1}.totals{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:20px}.box{background:#f3f8f4;padding:12px;border-radius:8px}.box b{display:block;font-size:18px}@media print{body{padding:0}}';
    doc.head.append(meta, title, style);
    const body = doc.body;
    const heading = doc.createElement('h1');
    heading.textContent = 'รายงานการเงินฟาร์ม';
    const printedAt = doc.createElement('p');
    printedAt.textContent = `สวนลุงนะ Smart Farm · พิมพ์เมื่อ ${new Date().toLocaleString('th-TH')}`;
    const totals = summary();
    const totalsBox = doc.createElement('div');
    totalsBox.className = 'totals';
    [['รายรับ', totals.income], ['รายจ่าย', totals.expense], ['ค้างซื้อ', totals.pending], ['กำไรสุทธิ', totals.profit]].forEach(([label, value]) => {
      const box = doc.createElement('div'); box.className = 'box';
      const name = doc.createElement('span'); name.textContent = label;
      const valueNode = doc.createElement('b'); valueNode.textContent = formatter.format(value);
      box.append(name, valueNode); totalsBox.appendChild(box);
    });
    const table = doc.createElement('table');
    const headRow = doc.createElement('tr');
    ['วันที่', 'ประเภท', 'หมวดต้นทุน', 'รายการ', 'จำนวนเงิน'].forEach(label => { const th = doc.createElement('th'); th.textContent = label; headRow.appendChild(th); });
    const thead = doc.createElement('thead'); thead.appendChild(headRow);
    const tbody = doc.createElement('tbody');
    if (!items.length) {
      const row = doc.createElement('tr'); const cell = doc.createElement('td'); cell.colSpan = 5; cell.textContent = 'ไม่มีข้อมูล'; row.appendChild(cell); tbody.appendChild(row);
    } else {
      items.forEach(item => {
        const row = doc.createElement('tr');
        [formatDate(item.createdAt), typeMeta[item.type]?.label || item.type, item.category || (item.type === 'income' ? '—' : 'ไม่ระบุ'), item.item, formatter.format(item.amount)].forEach(value => { const cell = doc.createElement('td'); cell.textContent = value; row.appendChild(cell); });
        tbody.appendChild(row);
      });
    }
    table.append(thead, tbody);
    body.append(heading, printedAt, totalsBox, table);
    doc.close();
    printable.setTimeout(() => printable.print(), 100);
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

  function printMonthlyReport() {
    const selected = $('financeReportMonth')?.value || currentMonthKey();
    const selectedItems = monthlyItems();
    const totals = window.FinanceCore?.summary(selectedItems, 0) || { income: 0, expense: 0, pending: 0, profit: 0 };
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const label = new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(`${selected}-01T00:00:00+07:00`));
    const rows = selectedItems.map(item => `<tr><td>${escape(formatDate(item.createdAt))}</td><td>${escape(typeMeta[item.type]?.label || item.type)}</td><td>${escape(item.category || '—')}</td><td>${escape(item.item)}</td><td>${escape(formatter.format(item.amount))}</td></tr>`).join('') || '<tr><td colspan="5">ยังไม่มีรายการในเดือนนี้</td></tr>';
    const printable = window.open('', '_blank', 'noopener,noreferrer');
    if (!printable) { window.showToast?.('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต pop-up แล้วลองใหม่', 'warning'); return; }
    printable.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>รายงานการเงิน ${escape(label)}</title><style>body{font-family:Tahoma,sans-serif;color:#17352c;padding:28px}h1{margin:0 0 4px;color:#07523d}p{color:#647b70}.totals{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.box{padding:12px;background:#eff9f2;border-radius:8px}.box b{display:block;margin-top:5px;font-size:18px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:9px;border-bottom:1px solid #dbe8e1;text-align:left}th{background:#eff9f2}@media print{body{padding:0}}</style></head><body><h1>รายงานการเงินฟาร์ม</h1><p>สวนลุงนะ Smart Farm · ${escape(label)} · สร้างอัตโนมัติ ${escape(new Date().toLocaleString('th-TH'))}</p><div class="totals"><div class="box">รายรับ<b>${escape(formatter.format(totals.income))}</b></div><div class="box">รายจ่าย<b>${escape(formatter.format(totals.expense))}</b></div><div class="box">ค้างซื้อ<b>${escape(formatter.format(totals.pending))}</b></div><div class="box">กำไรสุทธิ<b>${escape(formatter.format(totals.profit))}</b></div></div><table><thead><tr><th>วันที่</th><th>ประเภท</th><th>หมวดต้นทุน</th><th>รายการ</th><th>จำนวนเงิน</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    printable.document.close();
    printable.setTimeout(() => printable.print(), 150);
  }

  function boot() {
    $('financeForm')?.addEventListener('submit', add);
    window.addEventListener('finance:changed', refresh);
    $('financePrint')?.addEventListener('click', printReport);
    $('financeReportMonth')?.addEventListener('input', renderMonthlyReport);
    $('financeMonthlyPrint')?.addEventListener('click', printMonthlyReport);
    renderMonthlyReport();
    refresh();
  }

  window.addEventListener('access:ready', boot, { once: true });
})();
