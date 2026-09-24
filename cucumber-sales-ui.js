(function () {
  'use strict';

  const form = document.getElementById('cucumberSalesForm');
  const status = document.getElementById('cucumberSalesStatus');
  const rows = document.getElementById('cucumberSalesRows');
  const empty = document.getElementById('cucumberSalesEmpty');
  const totalWeight = document.getElementById('cucumberTotalWeight');
  const goodWeight = document.getElementById('cucumberGoodWeight');
  const goodPrice = document.getElementById('cucumberGoodPrice');
  const sortedWeight = document.getElementById('cucumberSortedWeight');
  const sortedPrice = document.getElementById('cucumberSortedPrice');
  const largeWeight = document.getElementById('cucumberLargeWeight');
  const dateInput = document.getElementById('cucumberSaleDate');
  const noteInput = document.getElementById('cucumberSaleNote');
  const summaryTotal = document.getElementById('cucumberSummaryTotal');
  const summaryGood = document.getElementById('cucumberSummaryGood');
  const summarySorted = document.getElementById('cucumberSummarySorted');
  const summaryLarge = document.getElementById('cucumberSummaryLarge');
  const summaryIncome = document.getElementById('cucumberSummaryIncome');
  const retryButton = document.getElementById('cucumberSalesRetry');

  if (!form || !window.CucumberSales) return;

  let started = false;
  let refreshInFlight = null;
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
      sum.good += calculated.gradeAKg;
      sum.sorted += calculated.gradeBKg;
      sum.large += calculated.legacyLargeKg;
      sum.income += calculated.totalIncome;
      return sum;
    }, { total: 0, good: 0, sorted: 0, large: 0, income: 0 });
    summaryTotal.textContent = formatKg(totals.total);
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
          <td>${formatKg(calculated.gradeAKg)}</td>
          <td>${calculated.gradeAPrice ? formatMoney(calculated.gradeAPrice) : '—'}</td>
          <td>${formatKg(calculated.gradeBKg)}</td>
          <td>${calculated.gradeBPrice ? formatMoney(calculated.gradeBPrice) : '—'}</td>
          <td>${calculated.totalIncome ? formatMoney(calculated.totalIncome) : '—'}</td>
          <td>${escapeHtml(item.note || '—')}</td>
          <td><button type="button" class="btn danger cucumber-delete" data-id="${escapeHtml(item.id)}">ลบ</button></td>
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
        renderRows(items);
        setStatus(`พร้อมใช้งาน · พบ ${items.length} รายการ`, 'success');
        return items;
      })
      .catch(error => {
        rows.innerHTML = '';
        empty.hidden = true;
        renderSummary([]);
        setStatus(`โหลดข้อมูลไม่สำเร็จ: ${error.message}`, 'error');
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
      note: noteInput.value
    };
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
      await window.CucumberSales.save(data);
      form.reset();
      dateInput.value = today();
      await refresh();
      setStatus('บันทึกผลการขายเรียบร้อยแล้ว', 'success');
    } catch (error) {
      setStatus(error.message || 'บันทึกข้อมูลไม่สำเร็จ', 'error');
    } finally {
      form.dataset.saving = 'false';
      submit.disabled = false;
    }
  }

  async function remove(event) {
    const button = event.target.closest('.cucumber-delete');
    if (!button) return;
    if (!window.confirm('ต้องการลบผลการขายรอบนี้ใช่หรือไม่?')) return;
    button.disabled = true;
    try {
      setStatus('กำลังลบข้อมูล…');
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
    [totalWeight, goodWeight, sortedWeight, largeWeight, goodPrice, sortedPrice].filter(Boolean).forEach(input => input.addEventListener('input', updateWeightStatus));
    retryButton?.addEventListener('click', refresh);
    refresh();
  }

  window.addEventListener('access:ready', event => start(event.detail), { once: true });
  if (window.SMARTFARM_ACCESS?.ready) start(window.SMARTFARM_ACCESS);
})();
