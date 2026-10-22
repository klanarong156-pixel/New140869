(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const Core = window.AccountingCore;
  const Store = window.AccountingStore;
  const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const monthFormatter = new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
  const typeOrder = ['asset', 'liability', 'equity', 'income', 'expense'];
  const state = { accounts: [], month: Core.monthKey(), monthEntries: [], reportEntries: [], legacy: null, page: 'overview', monthCache: new Map(), reportCache: new Map(), requestId: 0, toastTimer: null };
  const accountById = () => new Map(state.accounts.map(account => [account.id, account]));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const fmt = satang => money.format(Core.fromSatang(satang));
  const monthTitle = key => {
    const [year, month] = key.split('-').map(Number);
    return monthFormatter.format(new Date(Date.UTC(year, month - 1, 1, 5, 0)));
  };
  const displayDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '—';
    return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(`${value}T00:00:00+07:00`));
  };

  function setSync(message, failed = false) {
    const node = $('syncState');
    node.dataset.state = failed ? 'error' : 'ready';
    node.lastElementChild.textContent = message;
  }

  function toast(message, kind = 'success') {
    const node = $('toast');
    node.textContent = message;
    node.dataset.kind = kind;
    node.classList.add('visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => node.classList.remove('visible'), 3100);
  }

  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function downloadCsv(name, rows) {
    const content = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  async function readMonth(period, force = false) {
    if (!force && state.monthCache.has(period)) return state.monthCache.get(period);
    const rows = await Store.loadMonth(period);
    state.monthCache.set(period, rows);
    return rows;
  }

  function totalsFor(entries) { return Core.summarize(entries, state.accounts); }

  function renderBreakdown(entries) {
    const node = $('expenseBreakdown');
    const expenses = totalsFor(entries).expenseItems.filter(item => item.amountSatang > 0).slice(0, 6);
    node.replaceChildren();
    if (!expenses.length) {
      const empty = document.createElement('p'); empty.className = 'empty-inline'; empty.textContent = 'ยังไม่มีรายการในช่วงนี้'; node.append(empty); return;
    }
    const max = Math.max(...expenses.map(item => item.amountSatang));
    expenses.forEach(item => {
      const row = document.createElement('div'); row.className = 'breakdown-item';
      const name = document.createElement('span'); name.className = 'breakdown-name'; name.textContent = item.account?.name || 'บัญชีที่ไม่ระบุ';
      const track = document.createElement('span'); track.className = 'breakdown-track';
      const fill = document.createElement('span'); fill.className = 'breakdown-fill'; fill.style.width = `${Math.max(3, Math.round(item.amountSatang / max * 100))}%`; track.append(fill);
      const amount = document.createElement('strong'); amount.textContent = fmt(item.amountSatang);
      row.append(name, track, amount); node.append(row);
    });
  }

  function accountLineTotals(entry) {
    const rows = new Map();
    for (const line of entry.lines || []) {
      const account = accountById().get(line.accountId);
      const old = rows.get(line.accountId) || { name: account?.name || line.accountId, debit: 0, credit: 0 };
      old.debit += Number(line.debitSatang) || 0;
      old.credit += Number(line.creditSatang) || 0;
      rows.set(line.accountId, old);
    }
    return [...rows.values()];
  }

  function renderJournalRows(entries, tbody, empty) {
    tbody.replaceChildren();
    empty.hidden = entries.length > 0;
    entries.slice(0, 100).forEach(entry => {
      const tr = document.createElement('tr');
      const date = document.createElement('td');
      date.innerHTML = `<span class="entry-primary">${esc(displayDate(entry.date))}</span><span class="entry-secondary">${esc(entry.reference || entry.id)}</span>`;
      const description = document.createElement('td');
      description.innerHTML = `<span class="entry-primary">${esc(entry.description)}</span>${entry.crop ? `<span class="entry-secondary">${esc(entry.crop)}</span>` : ''}`;
      const accts = document.createElement('td');
      const pillWrap = document.createElement('div'); pillWrap.className = 'account-pills';
      accountLineTotals(entry).forEach(item => { const pill = document.createElement('span'); pill.className = 'account-pill'; pill.textContent = item.name; pillWrap.append(pill); });
      accts.append(pillWrap);
      const debit = document.createElement('td'); debit.className = 'number-cell'; debit.textContent = fmt(entry.debitTotalSatang);
      const credit = document.createElement('td'); credit.className = 'number-cell'; credit.textContent = fmt(entry.creditTotalSatang);
      const status = document.createElement('td'); status.innerHTML = '<span class="status-posted">บันทึกแล้ว</span>';
      tr.append(date, description, accts, debit, credit, status); tbody.append(tr);
    });
  }

  function renderOverview() {
    const entries = state.monthEntries;
    const totals = totalsFor(entries);
    $('overviewIncome').textContent = fmt(totals.incomeSatang);
    $('overviewExpense').textContent = fmt(totals.expenseSatang);
    $('overviewProfit').textContent = fmt(totals.profitSatang);
    $('overviewCount').textContent = new Intl.NumberFormat('th-TH').format(entries.length);
    renderBreakdown(entries);
    renderJournalRows(entries, $('recentRows'), $('recentEmpty'));
    $('todayLabel').textContent = `ภาพรวม ${monthTitle(state.month)}`;
  }

  async function refreshMonth(period, { force = false } = {}) {
    const requestId = ++state.requestId;
    setSync('กำลังโหลด');
    try {
      const entries = await readMonth(period, force);
      if (requestId !== state.requestId) return;
      if (state.page === 'overview' || period === $('journalMonth').value) {
        state.month = period;
        state.monthEntries = entries;
        if ($('overviewMonth').value !== period) $('overviewMonth').value = period;
        if ($('journalMonth').value !== period && state.page === 'journal') $('journalMonth').value = period;
        renderOverview();
        $('journalPeriodTitle').textContent = monthTitle(period);
        $('journalCount').textContent = `${entries.length} รายการ`;
        renderJournalRows(entries, $('journalRows'), $('journalEmpty'));
      }
      setSync('ซิงก์แล้ว');
    } catch (error) {
      if (requestId !== state.requestId) return;
      setSync('เชื่อมต่อไม่สำเร็จ', true);
      toast(`โหลดสมุดรายวันไม่สำเร็จ: ${error.message || 'ตรวจสอบการเชื่อมต่อ'}`, 'error');
    }
  }

  function makeLine(accountId = '', debit = '', credit = '') {
    const row = document.createElement('div'); row.className = 'entry-line';
    const select = document.createElement('select'); select.setAttribute('aria-label', 'บัญชี'); select.required = true;
    select.innerHTML = `<option value="">เลือกบัญชี</option>${state.accounts.filter(account => account.active !== false).map(account => `<option value="${esc(account.id)}">${esc(account.code)} · ${esc(account.name)}</option>`).join('')}`;
    select.value = accountId;
    const debitInput = document.createElement('input'); debitInput.type = 'number'; debitInput.min = '0'; debitInput.step = '0.01'; debitInput.inputMode = 'decimal'; debitInput.placeholder = '0.00'; debitInput.setAttribute('aria-label', 'ยอดเดบิต บาท'); debitInput.value = debit;
    const creditInput = document.createElement('input'); creditInput.type = 'number'; creditInput.min = '0'; creditInput.step = '0.01'; creditInput.inputMode = 'decimal'; creditInput.placeholder = '0.00'; creditInput.setAttribute('aria-label', 'ยอดเครดิต บาท'); creditInput.value = credit;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-line'; remove.textContent = '×'; remove.setAttribute('aria-label', 'ลบบรรทัด');
    row.append(select, debitInput, creditInput, remove);
    return row;
  }

  function readFormLines() {
    return [...$('entryLines').querySelectorAll('.entry-line')].map(row => ({
      accountId: row.querySelector('select').value,
      debitSatang: Core.toSatang(row.querySelector('input[aria-label="ยอดเดบิต บาท"]').value) ?? 0,
      creditSatang: Core.toSatang(row.querySelector('input[aria-label="ยอดเครดิต บาท"]').value) ?? 0,
      memo: ''
    }));
  }

  function updateBalance() {
    const lines = readFormLines();
    const debit = lines.reduce((sum, line) => sum + line.debitSatang, 0);
    const credit = lines.reduce((sum, line) => sum + line.creditSatang, 0);
    $('debitTotal').textContent = fmt(debit);
    $('creditTotal').textContent = fmt(credit);
    const status = $('balanceStatus');
    const valid = lines.length >= 2 && debit > 0 && debit === credit && lines.every(line => line.accountId && ((line.debitSatang > 0) !== (line.creditSatang > 0)));
    $('balanceCheck').dataset.balanced = String(valid);
    status.textContent = valid ? 'ยอดสมดุล · พร้อมบันทึก' : lines.length < 2 ? 'เพิ่มรายการอย่างน้อย 2 บรรทัด' : debit === credit && debit > 0 ? 'ตรวจบัญชีและยอดแต่ละบรรทัด' : 'ยอดเดบิตและเครดิตยังไม่เท่ากัน';
  }

  function openEntry() {
    $('entryError').hidden = true;
    $('entryForm').reset();
    $('entryDate').value = Core.localDateKey();
    $('entryLines').replaceChildren(makeLine('seed-cost'), makeLine('cash'));
    updateBalance();
    $('entryDialog').showModal();
    $('entryDescription').focus();
  }

  async function submitEntry(event) {
    event.preventDefault();
    const button = $('postEntryButton');
    const data = {
      date: $('entryDate').value,
      description: $('entryDescription').value.trim(),
      crop: $('entryCrop').value.trim(),
      lines: readFormLines()
    };
    const validation = Core.validateEntry(data, accountById());
    if (!validation.valid) {
      $('entryError').textContent = validation.errors.join(' · ');
      $('entryError').hidden = false;
      return;
    }
    button.disabled = true;
    button.textContent = 'กำลังบันทึก…';
    try {
      const saved = await Store.postEntry(data, state.accounts);
      state.monthCache.delete(saved.period);
      state.reportCache.delete(Number(saved.period.slice(0, 4)));
      const entries = await readMonth(saved.period, true);
      state.month = saved.period; state.monthEntries = entries;
      $('overviewMonth').value = saved.period; $('journalMonth').value = saved.period;
      $('entryDialog').close();
      renderOverview(); renderJournalRows(entries, $('journalRows'), $('journalEmpty'));
      $('journalPeriodTitle').textContent = monthTitle(saved.period); $('journalCount').textContent = `${entries.length} รายการ`;
      setSync('ซิงก์แล้ว'); toast(`บันทึก ${saved.reference} แล้ว`);
    } catch (error) {
      $('entryError').textContent = error.message || 'บันทึกไม่สำเร็จ กรุณาลองใหม่';
      $('entryError').hidden = false;
      toast(error.message || 'บันทึกรายการไม่สำเร็จ', 'error');
    } finally {
      button.disabled = false; button.textContent = 'บันทึกลงสมุดรายวัน';
    }
  }

  function renderAccounts() {
    const root = $('accountGroups'); root.replaceChildren();
    $('accountCount').textContent = `${state.accounts.length} บัญชี`;
    for (const type of typeOrder) {
      const groupAccounts = state.accounts.filter(account => account.type === type).sort((a, b) => String(a.code).localeCompare(String(b.code), 'en'));
      if (!groupAccounts.length) continue;
      const section = document.createElement('section'); section.className = 'account-group';
      const title = document.createElement('p'); title.className = 'group-title'; title.textContent = `${Core.ACCOUNT_TYPES[type]} · ${groupAccounts.length}`; section.append(title);
      groupAccounts.forEach(account => {
        const row = document.createElement('div'); row.className = `account-row${account.active === false ? ' account-inactive' : ''}`;
        const code = document.createElement('span'); code.className = 'account-code'; code.textContent = account.code;
        const name = document.createElement('span'); name.className = 'account-name'; name.textContent = `${account.name}${account.active === false ? ' · ปิดใช้งาน' : ''}`;
        const action = document.createElement('span'); action.className = 'account-type'; action.textContent = account.system ? 'มาตรฐาน' : (account.active === false ? '' : 'บัญชีของสวน');
        if (!account.system) {
          const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'text-button'; toggle.dataset.toggleAccount = account.id; toggle.textContent = account.active === false ? 'เปิดใช้' : 'ปิดใช้';
          row.append(code, name, toggle); row.lastChild.title = account.active === false ? 'เปิดใช้บัญชีนี้' : 'ปิดใช้งานโดยไม่ลบประวัติ';
        } else row.append(code, name, action);
        section.append(row);
      });
      root.append(section);
    }
  }

  async function submitAccount(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (state.accounts.some(account => account.code === data.code)) return toast('รหัสบัญชีนี้มีแล้ว', 'error');
    data.id = `user-${data.code}`;
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      const account = await Store.saveAccount(data);
      state.accounts.push(account); form.reset(); renderAccounts(); toast('เพิ่มบัญชีใหม่แล้ว');
    } catch (error) { toast(error.message || 'เพิ่มบัญชีไม่สำเร็จ', 'error'); }
    finally { button.disabled = false; }
  }

  async function toggleAccount(id) {
    const account = state.accounts.find(item => item.id === id);
    if (!account) return;
    try {
      await Store.setAccountActive(account, account.active === false);
      account.active = account.active === false; renderAccounts(); toast(account.active ? 'เปิดใช้งานบัญชีแล้ว' : 'ปิดใช้งานบัญชีแล้ว');
    } catch (error) { toast(error.message || 'เปลี่ยนสถานะบัญชีไม่สำเร็จ', 'error'); }
  }

  function renderReport(entries) {
    const totals = totalsFor(entries);
    $('reportProfit').textContent = fmt(totals.profitSatang);
    $('reportIncome').textContent = fmt(totals.incomeSatang);
    $('reportExpense').textContent = fmt(totals.expenseSatang);
    $('reportCount').textContent = new Intl.NumberFormat('th-TH').format(entries.length);
    const rows = $('reportRows'); rows.replaceChildren();
    const balances = totals.accountBalances;
    const visibleAccounts = state.accounts.filter(account => balances.has(account.id));
    $('reportEmpty').hidden = visibleAccounts.length > 0;
    visibleAccounts.sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) || String(a.code).localeCompare(String(b.code), 'en')).forEach(account => {
      const tr = document.createElement('tr');
      const code = document.createElement('td'); code.textContent = account.code;
      const name = document.createElement('td'); name.textContent = account.name;
      const type = document.createElement('td'); type.textContent = Core.ACCOUNT_TYPES[account.type] || account.type;
      const balance = document.createElement('td'); balance.className = 'number-cell'; balance.textContent = fmt(balances.get(account.id));
      tr.append(code, name, type, balance); rows.append(tr);
    });
  }

  async function loadReport(yearValue = $('reportYear').value) {
    const year = Number(yearValue);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return;
    setSync('กำลังโหลดรายงาน');
    try {
      let entries = state.reportCache.get(year);
      if (!entries) { entries = await Store.loadYear(year); state.reportCache.set(year, entries); }
      state.reportEntries = entries; renderReport(entries); setSync('ซิงก์แล้ว');
    } catch (error) { setSync('โหลดรายงานไม่สำเร็จ', true); toast(`โหลดรายงานไม่สำเร็จ: ${error.message || ''}`, 'error'); }
  }

  function prepareReportYears() {
    const select = $('reportYear');
    const year = Number(Core.localDateKey().slice(0, 4));
    select.replaceChildren();
    for (let value = year; value >= year - 5; value -= 1) {
      const option = document.createElement('option'); option.value = String(value); option.textContent = String(value + 543); select.append(option);
    }
  }

  function saleIncome(record) {
    if (record.entryMode === 'quick') return Number(record.totalIncome) || 0;
    if (record.entryMode === 'graded') return (Number(record.weights?.good) || 0) * (Number(record.prices?.good) || 0) + (Number(record.weights?.sorted) || 0) * (Number(record.prices?.sorted) || 0);
    if (record.gradeAKg !== undefined || record.gradeBKg !== undefined) return (Number(record.gradeAKg) || 0) * (Number(record.gradeAPrice) || 0) + (Number(record.gradeBKg) || 0) * (Number(record.gradeBPrice) || 0);
    return 0;
  }

  function renderLegacy() {
    if (!state.legacy) return;
    const financeBody = $('legacyFinanceRows'); financeBody.replaceChildren();
    $('legacyFinanceEmpty').hidden = state.legacy.finance.length > 0;
    state.legacy.finance.forEach(item => {
      const tr = document.createElement('tr');
      [displayDate(String(item.createdAt || '').slice(0, 10)), item.type === 'income' ? 'รายรับ' : item.type === 'expense' ? 'รายจ่าย' : 'ค้างซื้อ', item.category || 'ไม่ระบุ', item.item || '', money.format(Number(item.amount) || 0)].forEach((value, index) => { const td = document.createElement('td'); td.textContent = value; if (index === 4) td.className = 'number-cell'; tr.append(td); });
      financeBody.append(tr);
    });
    const salesBody = $('legacySalesRows'); salesBody.replaceChildren();
    $('legacySalesEmpty').hidden = state.legacy.sales.length > 0;
    state.legacy.sales.forEach(record => {
      const td = (value, number = false) => { const node = document.createElement('td'); node.textContent = value; if (number) node.className = 'number-cell'; return node; };
      const tr = document.createElement('tr');
      tr.append(td(displayDate(record.date)), td(`${Number(record.totalWeight) || 0} กก.`), td(`${Number(record.weights?.good ?? record.gradeAKg) || 0}`), td(`${Number(record.weights?.sorted ?? record.gradeBKg) || 0}`), td(money.format(saleIncome(record))), td(record.note || '—'));
      salesBody.append(tr);
    });
  }

  async function loadLegacy() {
    const button = $('loadLegacyButton'); button.disabled = true; button.textContent = 'กำลังโหลด…';
    try {
      state.legacy = await Store.loadLegacyRecords(); renderLegacy();
      if (state.legacy.financeError || state.legacy.salesError) toast('โหลดข้อมูลเก่าบางส่วนไม่ได้ ตรวจสอบสิทธิ์ Firebase', 'error');
      else toast(`โหลดข้อมูลเดิม ${state.legacy.finance.length + state.legacy.sales.length} รายการแล้ว`);
    } catch (error) { toast(error.message || 'โหลดข้อมูลเดิมไม่สำเร็จ', 'error'); }
    finally { button.disabled = false; button.textContent = '↻ โหลดข้อมูลเดิม'; }
  }

  function exportLegacy(kind) {
    if (!state.legacy) return toast('โหลดข้อมูลเดิมก่อนดาวน์โหลด', 'error');
    if (kind === 'legacy-finance') {
      const rows = [['วันที่', 'ประเภท', 'หมวด', 'รายการ', 'จำนวนเงิน (บาท)'], ...state.legacy.finance.map(item => [item.createdAt || '', item.type || '', item.category || '', item.item || '', Number(item.amount) || 0])];
      downloadCsv('ข้อมูลการเงินเดิม.csv', rows);
    } else {
      const rows = [['วันที่', 'น้ำหนักรวม (กก.)', 'เกรด A (กก.)', 'เกรด B (กก.)', 'รายรับ (บาท)', 'หมายเหตุ'], ...state.legacy.sales.map(item => [item.date || '', Number(item.totalWeight) || 0, Number(item.weights?.good ?? item.gradeAKg) || 0, Number(item.weights?.sorted ?? item.gradeBKg) || 0, saleIncome(item), item.note || ''])];
      downloadCsv('ข้อมูลยอดขายผลผลิตเดิม.csv', rows);
    }
    toast('ดาวน์โหลด CSV แล้ว');
  }

  function exportReport() {
    const accounts = accountById();
    const totals = totalsFor(state.reportEntries);
    const rows = [
      ['รายงานบัญชีสวน', $('reportYear').value],
      ['สร้างเมื่อ', new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })],
      [], ['สรุป', 'บาท'],
      ['รายได้รวม', Core.fromSatang(totals.incomeSatang)], ['ค่าใช้จ่ายรวม', Core.fromSatang(totals.expenseSatang)], ['กำไรสุทธิ', Core.fromSatang(totals.profitSatang)], [],
      ['รหัสบัญชี', 'ชื่อบัญชี', 'ประเภทบัญชี', 'ยอดสุทธิ (บาท)'],
      ...[...totals.accountBalances.entries()].map(([id, amount]) => { const account = accounts.get(id); return [account?.code || id, account?.name || id, Core.ACCOUNT_TYPES[account?.type] || '', Core.fromSatang(amount)]; })
    ];
    downloadCsv(`รายงานบัญชีสวน-${$('reportYear').value}.csv`, rows);
  }

  function navigate(page) {
    if (!document.querySelector(`[data-view="${page}"]`)) page = 'overview';
    state.page = page;
    document.querySelectorAll('.page-view').forEach(view => { const active = view.dataset.view === page; view.classList.toggle('active', active); view.hidden = !active; });
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.route === page));
    history.replaceState(null, '', `#${page}`);
    if (page === 'journal') {
      const period = $('journalMonth').value || state.month;
      refreshMonth(period).catch(() => {});
    } else if (page === 'reports') loadReport();
    else if (page === 'legacy' && !state.legacy) loadLegacy();
  }

  function installEvents() {
    document.addEventListener('click', event => {
      const route = event.target.closest('[data-route]');
      if (route) return navigate(route.dataset.route);
      if (event.target.closest('[data-open-entry]')) return openEntry();
      if (event.target.closest('[data-close-entry]')) return $('entryDialog').close();
      const exportButton = event.target.closest('[data-export]');
      if (exportButton) return exportLegacy(exportButton.dataset.export);
      const toggleButton = event.target.closest('[data-toggle-account]');
      if (toggleButton) return toggleAccount(toggleButton.dataset.toggleAccount);
    });
    $('entryForm').addEventListener('submit', submitEntry);
    $('entryLines').addEventListener('input', event => {
      const row = event.target.closest('.entry-line');
      if (row && event.target.type === 'number' && event.target.value) {
        const inputs = row.querySelectorAll('input[type="number"]');
        const other = [...inputs].find(input => input !== event.target);
        if (Number(event.target.value) > 0) other.value = '';
      }
      updateBalance();
    });
    $('entryLines').addEventListener('change', updateBalance);
    $('entryLines').addEventListener('click', event => {
      if (!event.target.closest('.remove-line')) return;
      const rows = $('entryLines').querySelectorAll('.entry-line');
      if (rows.length <= 2) return toast('ต้องมีอย่างน้อย 2 บรรทัด', 'error');
      event.target.closest('.entry-line').remove(); updateBalance();
    });
    $('addLineButton').addEventListener('click', () => { $('entryLines').append(makeLine()); updateBalance(); });
    $('accountForm').addEventListener('submit', submitAccount);
    $('overviewMonth').addEventListener('change', event => { state.month = event.target.value; $('journalMonth').value = state.month; refreshMonth(state.month); });
    $('journalMonth').addEventListener('change', event => { $('overviewMonth').value = event.target.value; state.month = event.target.value; refreshMonth(event.target.value); });
    $('refreshButton').addEventListener('click', () => { state.monthCache.delete($('journalMonth').value); refreshMonth($('journalMonth').value, { force: true }); });
    $('reportYear').addEventListener('change', event => { state.reportCache.delete(Number(event.target.value)); loadReport(event.target.value); });
    $('downloadReport').addEventListener('click', exportReport);
    $('loadLegacyButton').addEventListener('click', loadLegacy);
    $('signOutButton').addEventListener('click', () => { FirebaseAuth.clear(); location.replace('auth.html'); });
    $('entryDialog').addEventListener('click', event => { if (event.target === $('entryDialog')) $('entryDialog').close(); });
    window.addEventListener('firebase:auth-expired', () => { FirebaseAuth.clear(); location.replace('auth.html'); });
  }

  async function boot() {
    if (!window.FirebaseAuth?.user) { location.replace(`auth.html?next=${encodeURIComponent('index.html')}`); return; }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service worker registration failed:', error));
    $('userEmail').textContent = FirebaseAuth.user.email || 'บัญชีของฉัน';
    $('userAvatar').textContent = (FirebaseAuth.user.email || 'ส').trim().slice(0, 1).toUpperCase();
    $('overviewMonth').value = state.month; $('journalMonth').value = state.month;
    prepareReportYears(); installEvents();
    const firstPage = location.hash.replace(/^#/, '');
    try {
      state.accounts = await Store.loadAccounts(); renderAccounts();
      setSync('ซิงก์แล้ว');
      await refreshMonth(state.month);
      if (firstPage && firstPage !== 'overview') navigate(firstPage);
    } catch (error) {
      setSync('เชื่อมต่อไม่สำเร็จ', true);
      toast(`เริ่มต้นระบบบัญชีไม่สำเร็จ: ${error.message || ''}`, 'error');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
