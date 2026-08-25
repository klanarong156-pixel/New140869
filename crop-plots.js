(() => {
  'use strict';

  const STORAGE_KEY = 'smartfarm.cropPlots.v1';
  const MAX_PLOTS = 8;
  const state = { plots: [], editingId: '' };
  const $ = id => document.getElementById(id);

  function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
  }

  function normalize(value = {}) {
    return {
      id: String(value.id || '').trim().slice(0, 32),
      name: String(value.name || value.plot || '').trim().slice(0, 50),
      crop: String(value.crop || '').trim().slice(0, 60),
      startDate: String(value.startDate || '').slice(0, 10),
      status: ['active', 'paused', 'archived'].includes(value.status) ? value.status : 'active',
      notes: String(value.notes || '').trim().slice(0, 120),
      updatedAt: value.updatedAt || new Date().toISOString()
    };
  }

  function snapshot() { return state.plots.map(plot => ({ ...plot })); }

  function loadLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      state.plots = (Array.isArray(raw) ? raw : []).map(normalize).filter(plot => plot.id && plot.name && plot.crop && validDate(plot.startDate)).slice(0, MAX_PLOTS);
    } catch (_) { state.plots = []; }
  }

  async function load() {
    loadLocal();
    if (window.FirebaseDB && window.FirebaseAuth?.user) {
      try {
        const remote = await FirebaseDB.get('farm/cropPlots');
        if (Array.isArray(remote)) state.plots = remote.map(normalize).filter(plot => plot.id && plot.name && plot.crop && validDate(plot.startDate)).slice(0, MAX_PLOTS);
        if (!state.plots.length && window.cropCycle) {
          const legacy = window.cropCycle.get();
          if (legacy.crop && validDate(legacy.startDate)) state.plots = [normalize({ id: 'plot-legacy', name: 'แปลงหลัก', crop: legacy.crop, startDate: legacy.startDate })];
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
      } catch (error) { console.warn('โหลดหลายแปลงจาก Firebase ไม่สำเร็จ', error); }
    }
    renderAll();
  }

  async function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
    if (window.FirebaseDB && window.FirebaseAuth?.user) {
      try { await FirebaseDB.put('farm/cropPlots', snapshot()); }
      catch (error) { window.showToast?.('บันทึกในเครื่องแล้ว แต่ Firebase ยังไม่อัปเดต', 'warning'); }
    }
  }

  function age(startDate) {
    if (!validDate(startDate)) return 0;
    const start = new Date(`${startDate}T00:00:00`);
    const today = new Date();
    const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.max(0, Math.floor((current - start) / 86400000));
  }

  function formatDate(value) {
    if (!validDate(value)) return 'ไม่ระบุวันที่';
    return new Date(`${value}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function statusLabel(value) { return value === 'paused' ? 'พักแปลง' : value === 'archived' ? 'เก็บถาวร' : 'กำลังปลูก'; }

  function renderList() {
    const list = $('plotList');
    if (!list) return;
    list.replaceChildren();
    if (!state.plots.length) {
      const notice = document.createElement('div'); notice.className = 'notice';
      const icon = document.createElement('span'); icon.textContent = '🌱';
      const text = document.createElement('span'); text.textContent = 'ยังไม่มีแปลงเพิ่มเติม เพิ่มแปลงแรกเพื่อผูกงานดูแลและ reminder';
      notice.append(icon, text); list.append(notice); return;
    }
    state.plots.forEach(plot => {
      const article = document.createElement('article'); article.className = `plot-item ${plot.status}`;
      const icon = document.createElement('div'); icon.className = 'plot-item-icon'; icon.textContent = '🌿';
      const main = document.createElement('div'); main.className = 'plot-item-main';
      const name = document.createElement('strong'); name.textContent = plot.name;
      const crop = document.createElement('small'); crop.textContent = `${plot.crop} · ปลูกมาแล้ว ${age(plot.startDate)} วัน · ${statusLabel(plot.status)}`;
      const note = document.createElement('span'); note.textContent = `${formatDate(plot.startDate)}${plot.notes ? ` · ${plot.notes}` : ''}`;
      main.append(name, crop, note);
      const actions = document.createElement('div'); actions.className = 'plot-item-actions';
      [['edit', 'แก้ไข'], ['delete', 'ลบ']].forEach(([action, label]) => { const button = document.createElement('button'); button.type = 'button'; button.dataset.plotAction = action; button.dataset.plotId = plot.id; button.textContent = label; actions.append(button); });
      article.append(icon, main, actions); list.append(article);
    });
  }

  function renderSelect() {
    const select = $('reminderPlotId');
    if (!select) return;
    const current = select.value;
    select.replaceChildren();
    const main = document.createElement('option'); main.value = ''; main.textContent = 'ใช้กับแปลงหลัก'; select.append(main);
    state.plots.filter(plot => plot.status !== 'archived').forEach(plot => { const option = document.createElement('option'); option.value = plot.id; option.textContent = `${plot.name} · ${plot.crop}`; select.append(option); });
    if ([...select.options].some(option => option.value === current)) select.value = current;
  }

  function renderForm() {
    const plot = state.plots.find(item => item.id === state.editingId);
    $('plotFormTitle') && ($('plotFormTitle').textContent = plot ? 'แก้ไขแปลง' : 'เพิ่มแปลงปลูก');
    if (!plot) return;
    if ($('plotId')) $('plotId').value = plot.id;
    if ($('plotName')) $('plotName').value = plot.name;
    if ($('plotCrop')) $('plotCrop').value = plot.crop;
    if ($('plotStartDate')) $('plotStartDate').value = plot.startDate;
    if ($('plotStatus')) $('plotStatus').value = plot.status;
    if ($('plotNotes')) $('plotNotes').value = plot.notes;
  }

  function renderAll() { renderList(); renderSelect(); renderForm(); }

  async function savePlot(event) {
    event.preventDefault();
    const name = String($('plotName')?.value || '').trim();
    const crop = String($('plotCrop')?.value || '').trim();
    const startDate = String($('plotStartDate')?.value || '');
    if (!name || !crop || !validDate(startDate)) { window.showToast?.('กรุณาระบุชื่อแปลง ชื่อพืช และวันที่ปลูกให้ถูกต้อง', 'warning'); return; }
    const id = String($('plotId')?.value || '').trim() || `plot-${Date.now().toString(36)}`;
    const existing = state.plots.find(plot => plot.id === id);
    const plot = normalize({ id, name, crop, startDate, status: $('plotStatus')?.value, notes: $('plotNotes')?.value, updatedAt: new Date().toISOString() });
    if (existing) state.plots = state.plots.map(item => item.id === id ? plot : item);
    else if (state.plots.length < MAX_PLOTS) state.plots.push(plot);
    else { window.showToast?.(`รองรับสูงสุด ${MAX_PLOTS} แปลง`, 'warning'); return; }
    await persist();
    state.editingId = '';
    $('plotForm')?.reset();
    if ($('plotId')) $('plotId').value = '';
    renderAll();
    window.showToast?.('บันทึกข้อมูลแปลงแล้ว', 'success');
  }

  async function handleAction(event) {
    const button = event.target.closest('[data-plot-action]');
    if (!button) return;
    const id = button.dataset.plotId;
    const plot = state.plots.find(item => item.id === id);
    if (!plot) return;
    if (button.dataset.plotAction === 'edit') { state.editingId = id; renderForm(); $('plotName')?.focus(); return; }
    if (!window.confirm(`ลบแปลง “${plot.name}” หรือไม่? งาน reminder ที่ผูกไว้จะยังอยู่`)) return;
    state.plots = state.plots.filter(item => item.id !== id);
    await persist();
    renderAll();
    window.showToast?.('ลบแปลงแล้ว งาน reminder ยังไม่ถูกลบ', 'success');
  }

  function bind() {
    $('plotForm')?.addEventListener('submit', savePlot);
    $('plotCancel')?.addEventListener('click', () => { state.editingId = ''; $('plotForm')?.reset(); if ($('plotId')) $('plotId').value = ''; renderForm(); });
    $('plotList')?.addEventListener('click', handleAction);
    window.cropPlots = { load, get: () => snapshot(), find: id => state.plots.find(plot => plot.id === id) || null };
    load().catch(error => window.showToast?.(error.message || 'โหลดแปลงไม่สำเร็จ', 'warning'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
