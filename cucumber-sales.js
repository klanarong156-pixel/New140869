(function () {
  'use strict';
  const { GRADES, GRADE_LABELS, loadCucumberData, saveCustomer, savePrices, saveSale, cancelSale, deleteSale } = window.CucumberSales;
  const $ = id => document.getElementById(id);
  const money = value => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 2 }).format(Number(value) || 0);
  const kg = value => `${(Number(value) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} กก.`;
  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  let state = { sales: [], customers: [], prices: {} };

  function setText(id, value) { const node = $(id); if (node) node.textContent = value; }
  function activeSales() { return state.sales.filter(sale => sale.status !== 'cancelled'); }
  function customerById(id) { return state.customers.find(customer => customer.id === id); }
  function dateRange(sale) { const start = $('filterStart').value; const end = $('filterEnd').value; return (!start || sale.date >= start) && (!end || sale.date <= end); }

  function setPriceInputs() { GRADES.forEach(grade => { const value = state.prices[grade]?.price ?? ''; $(`standard-${grade}`).value = value; $(`price-${grade}`).value = value; }); }
  function populateCustomerSelects() {
    ['saleCustomer', 'filterCustomer'].forEach(id => {
      const select = $(id); if (!select) return;
      const selected = select.value;
      select.replaceChildren();
      const first = document.createElement('option'); first.value = ''; first.textContent = id === 'saleCustomer' ? 'เลือกจากลูกค้าเดิม' : 'ทุกคน'; select.appendChild(first);
      state.customers.sort((a, b) => a.name.localeCompare(b.name, 'th')).forEach(customer => { const option = document.createElement('option'); option.value = customer.id; option.textContent = customer.name; select.appendChild(option); });
      select.value = selected;
    });
  }

  function gradeAmount(grade) { return (Number($(`weight-${grade}`).value) || 0) * (Number($(`price-${grade}`).value) || 0); }
  function updateTotals() {
    let totalWeight = 0; let totalAmount = 0;
    GRADES.forEach(grade => { const amount = gradeAmount(grade); totalWeight += Number($(`weight-${grade}`).value) || 0; totalAmount += amount; setText(`amount-${grade}`, money(amount)); });
    setText('saleTotalWeight', kg(totalWeight)); setText('saleTotalAmount', money(totalAmount));
  }
  function getFilteredSales() {
    const customerId = $('filterCustomer').value; const status = $('filterStatus').value;
    return state.sales.filter(sale => dateRange(sale) && (!customerId || sale.customerId === customerId) && (!status || sale.status === status)).sort((a, b) => `${b.date}${b.updatedAt}`.localeCompare(`${a.date}${a.updatedAt}`));
  }
  function statusLabel(status) { return status === 'cancelled' ? 'ยกเลิก' : 'ลงบัญชีแล้ว'; }

  function renderKpis() {
    const active = activeSales(); const now = today(); const month = now.slice(0, 7); const todaySales = active.filter(sale => sale.date === now); const monthSales = active.filter(sale => sale.date.startsWith(month));
    const sum = (items, field) => items.reduce((total, item) => total + (Number(item[field]) || 0), 0);
    setText('kpiTodayAmount', money(sum(todaySales, 'totalAmount'))); setText('kpiTodayWeight', kg(sum(todaySales, 'totalWeight'))); setText('kpiMonthAmount', money(sum(monthSales, 'totalAmount'))); setText('kpiSaleCount', active.length); setText('kpiCustomerCount', new Set(active.map(sale => sale.customerId)).size);
  }
  function renderReports() {
    const totals = {}; GRADES.forEach(grade => { totals[grade] = { weight: 0, amount: 0 }; });
    activeSales().forEach(sale => GRADES.forEach(grade => { totals[grade].weight += Number(sale.grades?.[grade]?.weight) || 0; totals[grade].amount += Number(sale.grades?.[grade]?.amount) || 0; }));
    let totalWeight = 0; let totalAmount = 0; GRADES.forEach(grade => { totalWeight += totals[grade].weight; totalAmount += totals[grade].amount; setText(`report-${grade}`, `${kg(totals[grade].weight)} · ${money(totals[grade].amount)}`); }); setText('report-total', `${kg(totalWeight)} · ${money(totalAmount)}`);
  }
  function renderCustomers() {
    const target = $('customerList'); target.replaceChildren();
    if (!state.customers.length) { target.innerHTML = '<p class="helper">ยังไม่มีข้อมูลลูกค้า เพิ่มลูกค้าจากฟอร์มบันทึกการขายได้ทันที</p>'; return; }
    state.customers.forEach(customer => { const purchases = activeSales().filter(sale => sale.customerId === customer.id); const total = purchases.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0); const row = document.createElement('div'); row.className = 'customer-item'; row.innerHTML = `<span><strong></strong><small>${purchases.length} รายการ</small></span><strong>${money(total)}</strong>`; row.querySelector('span strong').textContent = customer.name; target.appendChild(row); });
  }
  function renderSales() {
    const rows = $('salesRows'); const sales = getFilteredSales(); rows.replaceChildren(); setText('salesCount', `${sales.length} รายการ`); $('salesEmpty').classList.toggle('hidden', sales.length > 0);
    sales.forEach(sale => { const row = document.createElement('tr'); const values = [sale.date, sale.customerName, kg(sale.totalWeight), money(sale.totalAmount), statusLabel(sale.status)]; values.forEach((value, index) => { const cell = document.createElement('td'); cell.dataset.label = ['วันที่', 'ลูกค้า', 'น้ำหนักรวม', 'ยอดขายรวม', 'สถานะบัญชี'][index]; cell.textContent = value; if (index === 4) cell.className = sale.status === 'cancelled' ? 'status-cancelled' : 'status-posted'; row.appendChild(cell); }); const actions = document.createElement('td'); actions.dataset.label = 'การดำเนินการ'; actions.className = 'actions'; const view = document.createElement('button'); view.className = 'btn ghost small'; view.type = 'button'; view.textContent = 'ดู'; view.onclick = () => showDetails(sale); actions.appendChild(view); if (sale.status !== 'cancelled') { const edit = document.createElement('button'); edit.className = 'btn secondary small'; edit.type = 'button'; edit.textContent = 'แก้ไข'; edit.onclick = () => editSale(sale); const cancel = document.createElement('button'); cancel.className = 'btn danger small'; cancel.type = 'button'; cancel.textContent = 'ยกเลิก'; cancel.onclick = () => void removeSale(sale); actions.append(edit, cancel); } const remove = document.createElement('button'); remove.className = 'btn danger small'; remove.type = 'button'; remove.textContent = 'ลบ'; remove.onclick = () => void deleteSaleRecord(sale); actions.appendChild(remove); row.appendChild(actions); rows.appendChild(row); });
  }
  function renderAll() { renderKpis(); renderReports(); renderCustomers(); renderSales(); }

  function clearForm() { $('cucumberSaleForm').reset(); $('saleId').value = ''; $('saleDate').value = today(); setPriceInputs(); setText('saleFormTitle', 'บันทึกการขายแตงกวา'); $('cancelEditButton').classList.add('hidden'); updateTotals(); }
  function editSale(sale) { $('saleId').value = sale.id; $('saleDate').value = sale.date; $('saleCustomer').value = sale.customerId; GRADES.forEach(grade => { $(`weight-${grade}`).value = sale.grades?.[grade]?.weight || ''; $(`price-${grade}`).value = sale.grades?.[grade]?.price || ''; }); setText('saleFormTitle', `แก้ไขรายการ ${sale.id}`); $('cancelEditButton').classList.remove('hidden'); $('record-sale').scrollIntoView({ behavior: 'smooth', block: 'start' }); updateTotals(); }
  function showDetails(sale) { const details = GRADES.map(grade => `${GRADE_LABELS[grade]}: ${kg(sale.grades?.[grade]?.weight)} × ${money(sale.grades?.[grade]?.price)}`).join('\n'); window.alert(`รายการขาย ${sale.id}\nวันที่ ${sale.date}\nลูกค้า ${sale.customerName}\n${details}\nรวม ${kg(sale.totalWeight)} · ${money(sale.totalAmount)}\nสถานะบัญชี: ${statusLabel(sale.status)}\nรหัสรายการรับ: CUCUMBER-INCOME-${sale.id}`); }
  async function removeSale(sale) { if (!window.confirm(`ยกเลิกรายการขายของ “${sale.customerName}” จำนวน ${money(sale.totalAmount)} หรือไม่?`)) return; try { const updated = await cancelSale(sale); const index = state.sales.findIndex(item => item.id === sale.id); if (index >= 0) state.sales[index] = updated; renderAll(); window.showToast?.('ยกเลิกการขายและรายการรับที่เชื่อมโยงแล้ว', 'success'); } catch (error) { window.showToast?.(error.message || 'ยกเลิกรายการไม่สำเร็จ', 'error'); } }
  async function deleteSaleRecord(sale) { if (!window.confirm(`ลบรายการขายของ “${sale.customerName}” และรายการรับที่เชื่อมโยงอย่างถาวรหรือไม่? การลบนี้ย้อนกลับไม่ได้`)) return; try { await deleteSale(sale); state.sales = state.sales.filter(item => item.id !== sale.id); renderAll(); window.showToast?.('ลบรายการขายและรายการรับที่เชื่อมโยงแล้ว', 'success'); } catch (error) { window.showToast?.(error.message || 'ลบรายการขายไม่สำเร็จ', 'error'); } }

  async function submitSale(event) { event.preventDefault(); const customer = customerById($('saleCustomer').value); const input = { id: $('saleId').value || undefined, date: $('saleDate').value, customerId: customer?.id, customerName: customer?.name, grades: Object.fromEntries(GRADES.map(grade => [grade, { weight: $('weight-' + grade).value, price: $('price-' + grade).value }])) }; const button = $('saveSaleButton'); button.disabled = true; try { const saved = await saveSale(input); const index = state.sales.findIndex(sale => sale.id === saved.id); if (index >= 0) state.sales[index] = saved; else state.sales.push(saved); clearForm(); renderAll(); window.showToast?.('บันทึกการขายและลงบัญชีเรียบร้อยแล้ว', 'success'); } catch (error) { window.showToast?.(error.message || 'ไม่สามารถบันทึกการขายได้', 'error'); } finally { button.disabled = false; } }
  async function addCustomer() { const name = $('newCustomerName').value.trim(); if (!name) { window.showToast?.('กรุณากรอกชื่อลูกค้าใหม่', 'warning'); return; } try { const customer = await saveCustomer({ name }); state.customers.push(customer); populateCustomerSelects(); $('saleCustomer').value = customer.id; $('newCustomerName').value = ''; window.showToast?.('เพิ่มลูกค้าเรียบร้อยแล้ว', 'success'); renderCustomers(); } catch (error) { window.showToast?.(error.message || 'เพิ่มลูกค้าไม่สำเร็จ', 'error'); } }
  async function submitPrices(event) { event.preventDefault(); try { const values = Object.fromEntries(GRADES.map(grade => [grade, $('standard-' + grade).value])); state.prices = await savePrices(values); setPriceInputs(); window.showToast?.('บันทึกราคามาตรฐานแล้ว', 'success'); } catch (error) { window.showToast?.(error.message || 'บันทึกราคาไม่สำเร็จ', 'error'); } }
  function exportCsv() { const header = ['วันที่', 'ลูกค้า', 'เกรดดี (กก.)', 'เกรดคัด (กก.)', 'เกรดใหญ่ (กก.)', 'น้ำหนักรวม (กก.)', 'ยอดขายรวม (บาท)', 'สถานะบัญชี', 'รหัสรายการ']; const rows = getFilteredSales().map(sale => [sale.date, sale.customerName, sale.grades.good.weight, sale.grades.sorted.weight, sale.grades.large.weight, sale.totalWeight, sale.totalAmount, statusLabel(sale.status), sale.id]); const csv = '\ufeff' + [header, ...rows].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n'); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `รายงานการขายแตงกวา-${today()}.csv`; link.click(); URL.revokeObjectURL(link.href); }
  async function boot() { try { setText('cucumberStatus', 'กำลังโหลดข้อมูล'); state = await loadCucumberData(); populateCustomerSelects(); setPriceInputs(); clearForm(); renderAll(); setText('cucumberStatus', 'ข้อมูลจริง · Firebase'); } catch (error) { setText('cucumberStatus', 'โหลดข้อมูลไม่สำเร็จ'); window.showToast?.(error.message || 'โหลดข้อมูลการขายไม่สำเร็จ', 'error'); } }

  function bind() { $('cucumberSaleForm').addEventListener('submit', submitSale); $('priceForm').addEventListener('submit', submitPrices); $('addCustomerButton').addEventListener('click', addCustomer); $('clearSaleButton').addEventListener('click', clearForm); $('cancelEditButton').addEventListener('click', clearForm); $('exportCsvButton').addEventListener('click', exportCsv); [...document.querySelectorAll('.cucumber-form input[type="number"]')].forEach(input => input.addEventListener('input', updateTotals)); ['filterStart', 'filterEnd', 'filterCustomer', 'filterStatus'].forEach(id => $(id).addEventListener('change', renderSales)); }
  window.addEventListener('access:ready', () => { bind(); void boot(); }, { once: true });
})();
