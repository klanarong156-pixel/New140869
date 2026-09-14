(function () {
  'use strict';

  const form = document.getElementById('cucumberSalesForm');
  const status = document.getElementById('cucumberSalesStatus');
  const rows = document.getElementById('cucumberSalesRows');
  const empty = document.getElementById('cucumberSalesEmpty');
  const totalWeight = document.getElementById('cucumberTotalWeight');
  const goodWeight = document.getElementById('cucumberGoodWeight');
  const sortedWeight = document.getElementById('cucumberSortedWeight');
  const largeWeight = document.getElementById('cucumberLargeWeight');
  const dateInput = document.getElementById('cucumberSaleDate');
  const noteInput = document.getElementById('cucumberSaleNote');
  const summaryTotal = document.getElementById('cucumberSummaryTotal');
  const summaryGood = document.getElementById('cucumberSummaryGood');
  const summarySorted = document.getElementById('cucumberSummarySorted');
  const summaryLarge = document.getElementById('cucumberSummaryLarge');

  if (!form || !window.CucumberSales) return;

  dateInput.value = new Date().toISOString().slice(0, 10);

  const formatKg = value => `${Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })} กก.`;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  function setStatus(message, kind = '') {
    status.textContent = message;
    status.className = `helper cucumber-sales-status${kind ? ` ${kind}` : ''}`;
  }

  function renderSummary(items) {
    const totals = items.reduce((sum, item) => {
      sum.total += Number(item.totalWeight || 0);
      sum.good += Number(item.weights?.good || 0);
      sum.sorted += Number(item.weights?.sorted || 0);
      sum.large += Number(item.weights?.large || 0);
      return sum;
    }, { total: 0, good: 0, sorted: 0, large: 0 });
    summaryTotal.textContent = formatKg(totals.total);
    summaryGood.textContent = formatKg(totals.good);
    summarySorted.textContent = formatKg(totals.sorted);
    summaryLarge.textContent = formatKg(totals.large);
  }

  function renderRows(items) {
    rows.innerHTML = items.map(item => `
      <tr>
        <td>${escapeHtml(item.date)}</td>
        <td>${formatKg(item.totalWeight)}</td>
        <td>${formatKg(item.weights?.good)}</td>
        <td>${formatKg(item.weights?.sorted)}</td>
        <td>${formatKg(item.weights?.large)}</td>
        <td>${escapeHtml(item.note || '—')}</td>
        <td><button type="button" class="btn danger cucumber-delete" data-id="${escapeHtml(item.id)}">ลบ</button></td>
      </tr>
    `).join('');
    empty.hidden = items.length > 0;
    renderSummary(items);
  }

  async function refresh() {
    try {
      const items = await CucumberSales.load();
      renderRows(items);
      setStatus(`บันทึกแล้ว ${items.length} รอบ`, 'success');
    } catch (error) {
      setStatus(`โหลดข้อมูลไม่สำเร็จ: ${error.message}`, 'error');
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const payload = {
      date: dateInput.value,
      totalWeight: totalWeight.value,
      weights: {
        good: goodWeight.value,
        sorted: sortedWeight.value,
        large: largeWeight.value
      },
      note: noteInput.value
    };
    try {
      submit.disabled = true;
      setStatus('กำลังบันทึก…');
      const data = CucumberSales.normalize(payload);
      await CucumberSales.save(data);
      form.reset();
      dateInput.value = new Date().toISOString().slice(0, 10);
      await refresh();
      setStatus('บันทึกผลการขายเรียบร้อยแล้ว', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });

  rows.addEventListener('click', async event => {
    const button = event.target.closest('.cucumber-delete');
    if (!button) return;
    if (!window.confirm('ต้องการลบผลการขายรอบนี้ใช่หรือไม่?')) return;
    try {
      button.disabled = true;
      await CucumberSales.remove(button.dataset.id);
      await refresh();
    } catch (error) {
      button.disabled = false;
      setStatus(error.message, 'error');
    }
  });

  [totalWeight, goodWeight, sortedWeight, largeWeight].forEach(input => input.addEventListener('input', () => {
    const total = Number(totalWeight.value || 0);
    const grades = Number(goodWeight.value || 0) + Number(sortedWeight.value || 0) + Number(largeWeight.value || 0);
    const difference = Math.round((total - grades) * 100) / 100;
    setStatus(Math.abs(difference) <= 0.01 ? 'น้ำหนักแต่ละเกรดรวมตรงกับน้ำหนักรวม' : `เหลือน้ำหนักให้จัดเกรดอีก ${difference.toLocaleString('th-TH')} กก.`, Math.abs(difference) <= 0.01 ? 'success' : '');
  }));

  refresh();
})();
