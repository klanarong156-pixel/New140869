(function () {
  'use strict';

  const form = document.getElementById('cucumberSalesForm');
  const status = document.getElementById('cucumberSalesStatus');
  const rows = document.getElementById('cucumberSalesRows');
  const empty = document.getElementById('cucumberSalesEmpty');
  const totalWeight = document.getElementById('cucumberTotalWeight');
  const totalIncome = document.getElementById('cucumberTotalIncome');
  const paymentStatus = document.getElementById('cucumberPaymentStatus');
  const goodWeight = document.getElementById('cucumberGoodWeight');
  const goodPrice = document.getElementById('cucumberGoodPrice');
  const sortedWeight = document.getElementById('cucumberSortedWeight');
  const sortedPrice = document.getElementById('cucumberSortedPrice');
  const largeWeight = document.getElementById('cucumberLargeWeight');
  const dateInput = document.getElementById('cucumberSaleDate');
  const noteInput = document.getElementById('cucumberSaleNote');
  const summaryTotal = document.getElementById('cucumberSummaryTotal');
  const summarySimple = document.getElementById('cucumberSummarySimple');
  const summaryGood = document.getElementById('cucumberSummaryGood');
  const summarySorted = document.getElementById('cucumberSummarySorted');
  const summaryLarge = document.getElementById('cucumberSummaryLarge');
  const summaryIncome = document.getElementById('cucumberSummaryIncome');
  const retryButton = document.getElementById('cucumberSalesRetry');

  if (!form || !window.CucumberSales) return;

  let started = false;
  let refreshInFlight = null;
  let items = [];
  let editingId = '';
  const today = () => new Date().toISOString().slice(0, 10);
  dateInput.value = today();

  const formatKg = value => `${Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })} กก.`;
  const formatMoney = value => Number(value || 0).toLocaleString('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 2 });
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const numberOrZero = value => Number.isFinite(Number(value)) ? Number(value) : 0;

  function setStatus(message, kind = '') {
    status.textContent = message;
    status.className = `helper cucumber-sales-status${kind ? ` ${kind}` : ''}`;
    if (retryButton) retryButton.hidden = kind !== 'error';
  }

  function toCalculated(item) {
    try { return window.CucumberSales.calculate(item); } catch (_) { return { gradeAKg: 0, gradeAPrice: 0, gradeBKg: 0, gradeBPrice: 0, totalKg: 0, totalIncome: 0 }; }
  }

  function renderSummary(items) {
    const totals = items.reduce((sum, item) => {
      const calculated = toCalculated(item);
      sum.total += calculated.totalKg;
      if (item.entryMode === 'quick') sum.simple += calculated.totalKg;
      else sum.good += calculated.gradeAKg;
      sum.sorted += calculated.gradeBKg;
      sum.large += calculated.legacyLargeKg;
      sum.income += calculated.totalIncome;
      return sum;
    }, { total: 0, simple: 0, good: 0, sorted: 0, large: 0, income: 0 });
    summaryTotal.textContent = formatKg(totals.total);
    if (summarySimple) summarySimple.textContent = formatKg(totals.simple);
    summaryGood.textContent = formatKg(totals.good);
    summarySorted.textContent = formatKg(totals.sorted);
    summaryLarge.textContent = formatKg(totals.large);
    if (summaryIncome) summaryIncome.textContent = formatMoney(totals.income);
  }

  function renderRows(items) {
    rows.innerHTML = items.map(item => {
      const calculated = toCalculated(item);
      return `
        <tr>
          <td>${escapeHtml(item.date || '—')}</td>
          <td>${formatKg(calculated.totalKg)}</td>
          <td>${item.entryMode === 'quick' ? 'แบบเร็ว' : formatKg(calculated.gradeAKg)}</td>
          <td>${item.entryMode === 'quick' ? '—' : (calculated.gradeAPrice ? formatMoney(calculated.gradeAPrice) : '—')}</td>
          <td>${item.entryMode === 'quick' ? '—' : formatKg(calculated.gradeBKg)}</td>
          <td>${calculated.gradeBPrice ? formatMoney(calculated.gradeBPrice) : '—'}</td>
          <td>${calculated.totalIncome ? formatMoney(calculated.totalIncome) : 'รอราคา'}</td>
          <td><span class="cucumber-payment ${item.paymentStatus === 'paid' ? 'paid' : 'pending'}">${item.paymentStatus === 'paid' ? 'จ่ายแล้ว' : 'ค้างจ่าย'}</span></td>
          <td>${escapeHtml(item.note || '—')}</td>
          <td><button type="button" class="btn secondary cucumber-edit" data-id="${escapeHtml(item.id)}">แก้ไข</button><button type="button" class="btn danger cucumber-delete" data-id="${escapeHtml(item.id)}">ลบ</button></td>
        </tr>
      `;
    }).join('');
    empty.hidden = items.length > 0;
    renderSummary(items);
  }

  async function refresh() {
    if (refreshInFlight) return refreshInFlight;
    setStatus('กำลังโหลดข้อมูลแตงกวา…');
    refreshInFlight = window.CucumberSales.load()
      .then(items => {
        items = items || [];
        renderRows(items);
        setStatus(`พร้อมใช้งาน · พบ ${items.length} รายการ`, 'success');
        return items;
      })
      .catch(error => {
        renderRows(items);
        setStatus(`โหลดข้อมูลล่าสุดไม่สำเร็จ: ${error.message}`, 'error');
        return [];
      })
      .finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  }

  function payloadFromForm() {
    return {
      date: dateInput.value,
      totalWeight: totalWeight.value,
      weights: { good: goodWeight.value, sorted: sortedWeight.value, large: largeWeight.value },
      gradeAKg: goodWeight.value,
      gradeAPrice: goodPrice?.value,
      gradeBKg: sortedWeight.value,
      gradeBPrice: sortedPrice?.value,
      note: noteInput.value,
      totalIncome: totalIncome?.value,
      entryMode: 'graded',
      priceA: goodPrice?.value,
      priceB: sortedPrice?.value,
      paymentStatus: paymentStatus?.value || 'pending',
      id: editingId || undefined
    };
  }

  function updateTotalWeight() {
    const total = numberOrZero(goodWeight?.value) + numberOrZero(sortedWeight?.value) + numberOrZero(largeWeight?.value);
    if (totalWeight) totalWeight.value = total ? String(Math.round(total * 100) / 100) : '';
    updateWeightStatus();
  }

  async function save(event) {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    if (form.dataset.saving === 'true') return;
    form.dataset.saving = 'true';
    submit.disabled = true;
    try {
      setStatus('กำลังตรวจสอบและบันทึกข้อมูล…');
      const data = window.CucumberSales.normalize(payloadFromForm());
      const saved = await window.CucumberSales.save(data);
      try {
        const calculated = window.CucumberSales.calculate(saved);
        if (calculated.totalIncome > 0) {
          if (!window.saveFinanceItem) throw new Error('ระบบรายรับยังโหลดไม่เสร็จ กรุณาลองใหม่อีกครั้ง');
          await window.saveFinanceItem({
            id: `CUC-INCOME-${saved.id}`,
            type: saved.paymentStatus === 'paid' ? 'income' : 'pending',
            category: 'ขายผลผลิต',
            item: `แตงกวา ${calculated.totalKg.toLocaleString('th-TH')} กก. · ${saved.paymentStatus === 'paid' ? 'จ่ายแล้ว' : 'ค้างจ่าย'}`,
            amount: calculated.totalIncome,
            createdAt: `${saved.date}T12:00:00+07:00`
          });
        } else if (window.deleteFinanceItem) {
          await window.deleteFinanceItem(`CUC-INCOME-${saved.id}`).catch(() => {});
        }
      } catch (financeError) {
        throw new Error(`บันทึกผลผลิตแล้ว แต่ปรับรายการการเงินไม่สำเร็จ: ${financeError.message}`);
      }
      form.reset();
      dateInput.value = today();
      editingId = '';
      if (submit) submit.textContent = 'บันทึกผลผลิต';
      if (totalWeight) totalWeight.value = '';
      await refresh();
      window.dispatchEvent(new CustomEvent('finance:changed'));
      setStatus('บันทึกผลการขายเรียบร้อยแล้ว', 'success');
    } catch (error) {
      setStatus(error.message || 'บันทึกข้อมูลไม่สำเร็จ', 'error');
    } finally {
      form.dataset.saving = 'false';
      submit.disabled = false;
    }
  }

  async function remove(event) {
    const editButton = event.target.closest('.cucumber-edit');
    if (editButton) {
      const item = items.find(entry => entry.id === editButton.dataset.id);
      if (!item) return;
      editingId = item.id;
      dateInput.value = item.date || today();
      goodWeight.value = item.weights?.good || item.gradeAKg || '';
      sortedWeight.value = item.weights?.sorted || item.gradeBKg || '';
      largeWeight.value = item.weights?.large || '';
      goodPrice.value = item.prices?.good ?? item.gradeAPrice ?? '';
      sortedPrice.value = item.prices?.sorted ?? item.gradeBPrice ?? '';
      paymentStatus.value = item.paymentStatus === 'paid' ? 'paid' : 'pending';
      noteInput.value = item.note || '';
      updateTotalWeight();
      const submit = form.querySelector('button[type="submit"]');
      if (submit) submit.textContent = 'บันทึกการแก้ไข';
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setStatus('กำลังแก้ไขรายการนี้ ใส่ราคาแล้วกดบันทึกได้เลย');
      return;
    }
    const button = event.target.closest('.cucumber-delete');
    if (!button) return;
    if (!window.confirm('ต้องการลบผลการขายรอบนี้ใช่หรือไม่?')) return;
    button.disabled = true;
    try {
      setStatus('กำลังลบข้อมูล…');
      if (window.deleteFinanceItem) await window.deleteFinanceItem(`CUC-INCOME-${button.dataset.id}`);
      await window.CucumberSales.remove(button.dataset.id);
      await refresh();
      setStatus('ลบรายการเรียบร้อยแล้ว', 'success');
    } catch (error) {
      button.disabled = false;
      setStatus(error.message || 'ลบรายการไม่สำเร็จ', 'error');
    }
  }

  function updateWeightStatus() {
    const total = numberOrZero(totalWeight.value);
    const grades = numberOrZero(goodWeight.value) + numberOrZero(sortedWeight.value) + numberOrZero(largeWeight.value);
    const difference = Math.round((total - grades) * 100) / 100;
    if (total <= 0 && !goodWeight.value && !sortedWeight.value && !largeWeight.value) return setStatus('พร้อมบันทึกข้อมูล');
    setStatus(Math.abs(difference) <= 0.01 ? 'น้ำหนักแต่ละเกรดรวมตรงกับน้ำหนักรวม' : `เหลือน้ำหนักให้จัดเกรดอีก ${difference.toLocaleString('th-TH')} กก.`, Math.abs(difference) <= 0.01 ? 'success' : '');
  }

  function start(access) {
    if (started) return;
    started = true;
    if (!access?.user) {
      setStatus('กรุณาเข้าสู่ระบบก่อนบันทึกข้อมูลแตงกวา', 'error');
      return;
    }
    form.addEventListener('submit', save);
    rows.addEventListener('click', remove);
    [goodWeight, sortedWeight, largeWeight, goodPrice, sortedPrice].filter(Boolean).forEach(input => input.addEventListener('input', updateTotalWeight));
    retryButton?.addEventListener('click', refresh);
    refresh();
  }

  window.addEventListener('access:ready', event => start(event.detail), { once: true });
  if (window.SMARTFARM_ACCESS?.ready) start(window.SMARTFARM_ACCESS);
})();
