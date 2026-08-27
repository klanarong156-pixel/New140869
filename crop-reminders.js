(() => {
  'use strict';

  const STORAGE_KEY = 'smartfarm.cropReminders.cache';
  const MAX_ITEMS = 8;
  const $ = id => document.getElementById(id);
  const isMqttConnected = () => typeof APP_STATE !== 'undefined' && Boolean(APP_STATE.mqttConnected);
  const state = {
    enabled: true,
    repeatDaily: false,
    quietStart: '22:00',
    quietEnd: '07:00',
    leadDays: 1,
    hour: 18,
    minute: 0,
    items: []
  };

  const clamp = (value, min, max, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
  };

  function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
  }

  function normalizeItem(value = {}) {
    const id = String(value.id || '').trim().slice(0, 31);
    const title = String(value.title || '').trim().slice(0, 70);
    const due = String(value.due || value.dueDate || '').slice(0, 10);
    return {
      id,
      title,
      due,
      note: String(value.note || '').trim().slice(0, 120),
      plotId: String(value.plotId || '').trim().slice(0, 32),
      repeatEveryDays: clamp(value.repeatEveryDays, 0, 30, 0),
      leadDays: clamp(value.leadDays, 0, 7, state.leadDays),
      enabled: value.enabled !== false,
      done: value.done === true,
      lastSentDate: String(value.lastSentDate || '').slice(0, 10)
    };
  }

  function normalizeBundle(value = {}) {
    state.enabled = value.enabled !== false;
    state.repeatDaily = value.repeatDaily === true;
    state.quietStart = /^\d{2}:\d{2}$/.test(String(value.quietStart || '')) ? String(value.quietStart) : '22:00';
    state.quietEnd = /^\d{2}:\d{2}$/.test(String(value.quietEnd || '')) ? String(value.quietEnd) : '07:00';
    state.leadDays = clamp(value.leadDays, 0, 7, 1);
    state.hour = clamp(value.hour, 0, 23, 18);
    state.minute = clamp(value.minute, 0, 59, 0);
    state.items = (Array.isArray(value.items) ? value.items : [])
      .map(normalizeItem)
      .filter(item => item.id && item.title && validDate(item.due))
      .slice(0, MAX_ITEMS);
  }

  function snapshot() {
    return {
      enabled: state.enabled,
      repeatDaily: state.repeatDaily,
      quietStart: state.quietStart,
      quietEnd: state.quietEnd,
      leadDays: state.leadDays,
      hour: state.hour,
      minute: state.minute,
      items: state.items.map(item => ({ ...item }))
    };
  }

  function localLoad() {
    try {
      const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      normalizeBundle(cached);
    } catch (_) {
      normalizeBundle({});
    }
  }

  async function load() {
    localLoad();
    if (window.FirebaseDB && window.FirebaseAuth?.user) {
      try {
        const remote = await FirebaseDB.get('farm/cropReminders');
        if (remote) {
          normalizeBundle(remote);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
        }
      } catch (error) {
        console.warn('โหลดรายการเตือนจาก Firebase ไม่สำเร็จ', error);
      }
    }
    renderAll();
    syncToDevice();
  }

  async function persist() {
    const data = snapshot();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (window.FirebaseDB && window.FirebaseAuth?.user) {
      try {
        await FirebaseDB.put('farm/cropReminders', data);
      } catch (error) {
        window.showToast?.('บันทึกในเครื่องแล้ว แต่ Firebase ยังไม่อัปเดต', 'warning');
      }
    }
  }

  function publish(payload, silent = false) {
    const handler = window.mqttHandler;
    const topic = window.MQTT_CONFIG?.topics?.reminderSet;
    if (!handler?.publish || !topic || !isMqttConnected()) {
      if (!silent) {
        setStatus('บันทึกแล้ว รอ ESP8266 ออนไลน์เพื่อส่งรายการเตือน', 'warning');
      }
      return false;
    }
    const sent = handler.publish(topic, JSON.stringify(payload), { qos: 0, retain: false });
    if (!sent && !silent) setStatus('บันทึกแล้ว แต่ส่งรายการไป ESP8266 ไม่สำเร็จ', 'warning');
    return sent;
  }

  function syncToDevice() {
    if (!isMqttConnected()) return false;
    publish(settingsPayload(), true);
    state.items.forEach(item => publish({ op: 'upsert', ...item }, true));
    setStatus('ตั้งค่า reminder พร้อมใช้งานบน ESP8266', 'success');
    return true;
  }

  function setStatus(message, type = 'info') {
    const targets = [$('reminderStatus'), $('telegramReminderStatus')].filter(Boolean);
    targets.forEach(target => {
      target.className = `notice ${type}`;
      const span = target.querySelector('span:last-child');
      if (span) span.textContent = message;
      else target.textContent = message;
    });
  }

  function formatDate(value) {
    if (!validDate(value)) return 'ไม่ระบุวันที่';
    return new Date(`${value}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function dateDelta(value) {
    if (!validDate(value)) return 9999;
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const due = new Date(`${value}T00:00:00`);
    return Math.round((due - start) / 86400000);
  }

  function addDays(value, days) {
    const date = validDate(value) ? new Date(`${value}T00:00:00`) : new Date();
    date.setDate(date.getDate() + Number(days || 0));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function relativeDate(value) {
    const delta = dateDelta(value);
    if (delta === 0) return 'วันนี้';
    if (delta === 1) return 'พรุ่งนี้';
    if (delta < 0) return `เลยกำหนด ${Math.abs(delta)} วัน`;
    if (delta <= 7) return `อีก ${delta} วัน`;
    return formatDate(value);
  }

  function reminderTime() {
    return `${String(state.hour).padStart(2, '0')}:${String(state.minute).padStart(2, '0')}`;
  }

  function timeParts(value, fallbackHour, fallbackMinute) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
    return match ? { hour: Number(match[1]), minute: Number(match[2]) } : { hour: fallbackHour, minute: fallbackMinute };
  }

  function settingsPayload() {
    const start = timeParts(state.quietStart, 22, 0);
    const end = timeParts(state.quietEnd, 7, 0);
    return { op: 'settings', enabled: state.enabled, repeatDaily: state.repeatDaily, quietStartHour: start.hour, quietStartMinute: start.minute, quietEndHour: end.hour, quietEndMinute: end.minute, leadDays: state.leadDays, hour: state.hour, minute: state.minute };
  }

  function pendingItems() {
    return state.items.filter(item => item.enabled && !item.done).sort((a, b) => a.due.localeCompare(b.due));
  }

  function nextTask() {
    return pendingItems()[0] || null;
  }

  function renderDashboard() {
    const task = nextTask();
    const title = $('cropTasksTitle');
    const meta = $('cropTasksMeta');
    const count = $('cropTasksCount');
    const summary = $('cropTasksSummary');
    const link = $('cropTasksLink');
    if (!title || !meta) return;
    if (!task) {
      title.textContent = 'ยังไม่มีงานรอบปลูกที่ต้องทำ';
      meta.textContent = 'เพิ่มงาน เช่น ใส่ปุ๋ย ตรวจใบ หรือกำจัดวัชพืช';
      if (count) count.textContent = '0 งานค้าง';
    } else {
      title.textContent = `${relativeDate(task.due)} · ${task.title}`;
      meta.textContent = `${formatDate(task.due)} · ${task.note || `ตั้งเตือนล่วงหน้า ${task.leadDays} วัน`}`;
      if (count) count.textContent = `${pendingItems().length} งานค้าง`;
    }
    if (summary) summary.hidden = !task;
    if (link) link.textContent = task ? 'จัดการงานรอบปลูก' : 'เพิ่มงานรอบปลูก';
  }

  function renderSettings() {
    if ($('reminderEnabled')) $('reminderEnabled').checked = state.enabled;
    if ($('reminderRepeatDaily')) $('reminderRepeatDaily').checked = state.repeatDaily;
    if ($('reminderQuietStart')) $('reminderQuietStart').value = state.quietStart;
    if ($('reminderQuietEnd')) $('reminderQuietEnd').value = state.quietEnd;
    if ($('reminderQuietSummary')) $('reminderQuietSummary').textContent = `ช่วงเงียบ ${state.quietStart}–${state.quietEnd}`;
    if ($('reminderLeadDays')) $('reminderLeadDays').value = String(state.leadDays);
    if ($('reminderTime')) $('reminderTime').value = reminderTime();
    const configured = $('telegramReminderConfigured');
    if (configured) configured.textContent = state.enabled ? `เตือนล่วงหน้า ${state.leadDays} วัน เวลา ${reminderTime()}` : 'ปิดการแจ้งเตือนชั่วคราว';
  }

  function renderList() {
    const list = $('reminderList');
    if (!list) return;
    list.replaceChildren();
    if (!state.items.length) {
      const notice = document.createElement('div');
      notice.className = 'notice';
      const icon = document.createElement('span');
      icon.textContent = '🌱';
      const message = document.createElement('span');
      message.textContent = 'ยังไม่มีงาน เพิ่มงานแรก เช่น “ใส่ปุ๋ยครั้งที่ 2” ได้เลย';
      notice.append(icon, message);
      list.append(notice);
      return;
    }
    [...state.items].sort((a, b) => a.due.localeCompare(b.due)).forEach(item => {
      const delta = dateDelta(item.due);
      const article = document.createElement('article');
      article.className = `reminder-item ${item.done ? 'is-done' : delta < 0 ? 'is-overdue' : delta <= 1 ? 'is-soon' : ''}`;
      const icon = document.createElement('div');
      icon.className = 'reminder-item-icon';
      icon.textContent = item.done ? '✓' : delta < 0 ? '!' : '◷';
      const main = document.createElement('div');
      main.className = 'reminder-item-main';
      const title = document.createElement('strong');
      title.textContent = `${relativeDate(item.due)} · ${item.title}`;
      const detail = document.createElement('small');
      const plot = window.cropPlots?.find?.(item.plotId);
      detail.textContent = `${formatDate(item.due)} · ${plot ? `${plot.name} · ` : ''}${item.note || 'ไม่มีหมายเหตุ'} · ${item.repeatEveryDays ? `ทำซ้ำทุก ${item.repeatEveryDays} วัน · ` : ''}เตือน ${item.leadDays} วันล่วงหน้า เวลา ${reminderTime()}`;
      const actions = document.createElement('div');
      actions.className = 'reminder-item-actions';
      main.append(title, detail, actions);
      const status = document.createElement('span');
      status.className = 'reminder-item-date';
      status.textContent = item.done ? 'เสร็จแล้ว' : item.enabled ? 'เปิดเตือน' : 'ปิดเตือน';
      const addAction = (action, label) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.reminderAction = action;
        button.dataset.reminderId = item.id;
        button.textContent = label;
        actions.append(button);
      };
      if (!item.done) {
        addAction('done', 'ทำเสร็จแล้ว');
        if (delta < 0) addAction('snooze', 'เลื่อน 1 วัน');
      }
      addAction('edit', 'แก้ไข');
      addAction('toggle', item.enabled ? 'ปิดเตือน' : 'เปิดเตือน');
      addAction('delete', 'ลบ');
      article.append(icon, main, status);
      list.append(article);
    });
  }

  function renderAll() {
    renderDashboard();
    renderSettings();
    renderList();
  }

  async function saveSettings(event) {
    event?.preventDefault();
    const time = String($('reminderTime')?.value || '18:00');
    const match = /^(\d{2}):(\d{2})$/.exec(time);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
      setStatus('กรุณาระบุเวลาแจ้งเตือนให้ถูกต้อง', 'warning');
      return false;
    }
    state.enabled = Boolean($('reminderEnabled')?.checked);
    state.repeatDaily = Boolean($('reminderRepeatDaily')?.checked);
    state.quietStart = String($('reminderQuietStart')?.value || '22:00');
    state.quietEnd = String($('reminderQuietEnd')?.value || '07:00');
    state.leadDays = clamp($('reminderLeadDays')?.value, 0, 7, 1);
    state.hour = Number(match[1]);
    state.minute = Number(match[2]);
    await persist();
    publish(settingsPayload());
    renderAll();
    setStatus('บันทึกการตั้งค่า Telegram reminder แล้ว', 'success');
    return true;
  }

  function resetForm() {
    if ($('reminderForm')) $('reminderForm').reset();
    if ($('reminderTaskId')) $('reminderTaskId').value = '';
    if ($('reminderLead')) $('reminderLead').value = String(state.leadDays);
    if ($('reminderFormTitle')) $('reminderFormTitle').textContent = 'เพิ่มงานที่ต้องทำ';
  }

  async function saveItem(event) {
    event?.preventDefault();
    const title = String($('reminderTitle')?.value || '').trim();
    const due = String($('reminderDue')?.value || '');
    if (!title || !validDate(due)) {
      setStatus('กรุณาระบุชื่องานและวันที่ให้ถูกต้อง', 'warning');
      return false;
    }
    const id = String($('reminderTaskId')?.value || '').trim() || `task-${Date.now().toString(36)}`;
    const existing = state.items.find(item => item.id === id);
    const item = normalizeItem({
      id,
      title,
      due,
      note: $('reminderNote')?.value || '',
      plotId: $('reminderPlotId')?.value || '',
      repeatEveryDays: $('reminderRepeatDays')?.value,
      leadDays: $('reminderLead')?.value,
      enabled: existing?.enabled !== false,
      done: existing?.done === true && existing.due === due
    });
    const index = state.items.findIndex(entry => entry.id === id);
    if (index >= 0) state.items[index] = item;
    else if (state.items.length < MAX_ITEMS) state.items.push(item);
    else {
      setStatus(`อุปกรณ์รองรับ reminder สูงสุด ${MAX_ITEMS} งาน`, 'warning');
      return false;
    }
    await persist();
    publish({ op: 'upsert', ...item });
    renderAll();
    resetForm();
    setStatus('บันทึกงานและส่งไปยัง ESP8266 แล้ว', 'success');
    return true;
  }

  async function handleItemAction(event) {
    const button = event.target.closest('[data-reminder-action]');
    if (!button) return;
    const id = button.dataset.reminderId;
    const index = state.items.findIndex(item => item.id === id);
    if (index < 0) return;
          const item = state.items[index];
      const action = button.dataset.reminderAction;

    if (action === 'edit') {
      if ($('reminderTaskId')) $('reminderTaskId').value = item.id;
      if ($('reminderTitle')) $('reminderTitle').value = item.title;
      if ($('reminderDue')) $('reminderDue').value = item.due;
      if ($('reminderNote')) $('reminderNote').value = item.note;
      if ($('reminderPlotId')) $('reminderPlotId').value = item.plotId || '';
      if ($('reminderRepeatDays')) $('reminderRepeatDays').value = String(item.repeatEveryDays || 0);
      if ($('reminderLead')) $('reminderLead').value = String(item.leadDays);
      if ($('reminderFormTitle')) $('reminderFormTitle').textContent = 'แก้ไขงานรอบปลูก';
      $('reminderTitle')?.focus();
      return;
    }
    if (action === 'delete') {
      if (!window.confirm(`ลบงาน “${item.title}” หรือไม่?`)) return;
      state.items.splice(index, 1);
      window.farmAnalytics?.recordTask?.('deleted', { id, title: item.title });
      await persist();
      publish({ op: 'delete', id });
    } else if (action === 'done') {
      item.done = true;
      window.farmAnalytics?.recordTask?.('done', { id, title: item.title });
      await persist();
      publish({ op: 'done', id, done: true });
    } else if (action === 'toggle') {
      item.enabled = !item.enabled;
      await persist();
      publish({ op: 'upsert', ...item });
    } else if (action === 'snooze') {
      const due = addDays(item.due, 1);
      item.due = due;
      item.done = false;
      item.lastSentDate = '';
      window.farmAnalytics?.recordTask?.('snoozed', { id, title: item.title, due });
      await persist();
      publish({ op: 'snooze', id, due });
    }
    renderAll();
  }

  function bind() {
    $('reminderSettingsForm')?.addEventListener('submit', saveSettings);
    $('reminderForm')?.addEventListener('submit', saveItem);
    $('reminderCancel')?.addEventListener('click', resetForm);
    $('reminderList')?.addEventListener('click', handleItemAction);
    $('reminderTest')?.addEventListener('click', () => {
      if (publish({ op: 'test' })) setStatus('ส่งคำสั่งทดสอบ reminder ไปยัง ESP8266 แล้ว', 'success');
    });
    window.addEventListener('mqtt:connected', syncToDevice);
    window.addEventListener('reminder:status', event => {
      const detail = event.detail || {};
      let changed = false;
      const hm = (hour, minute, fallback) => Number.isFinite(Number(hour)) && Number.isFinite(Number(minute)) ? `${String(Number(hour)).padStart(2, '0')}:${String(Number(minute)).padStart(2, '0')}` : fallback;
      if (detail.quietStartHour !== undefined) state.quietStart = hm(detail.quietStartHour, detail.quietStartMinute, state.quietStart);
      if (detail.quietEndHour !== undefined) state.quietEnd = hm(detail.quietEndHour, detail.quietEndMinute, state.quietEnd);
      if (detail.leadDays !== undefined) state.leadDays = clamp(detail.leadDays, 0, 7, state.leadDays);
      if (detail.hour !== undefined) state.hour = clamp(detail.hour, 0, 23, state.hour);
      if (detail.minute !== undefined) state.minute = clamp(detail.minute, 0, 59, state.minute);
      if (detail.id) {
        const item = state.items.find(entry => entry.id === detail.id);
        if (item) {
          if (detail.lastSentDate !== undefined && item.lastSentDate !== (detail.lastSentDate || '')) { item.lastSentDate = detail.lastSentDate || ''; changed = true; }
          if (detail.due && item.due !== detail.due) { item.due = detail.due; changed = true; }
          if (detail.done !== undefined && item.done !== Boolean(detail.done)) { item.done = Boolean(detail.done); changed = true; }
          if (detail.taskEnabled !== undefined && item.enabled !== Boolean(detail.taskEnabled)) { item.enabled = Boolean(detail.taskEnabled); changed = true; }
          if (detail.repeatEveryDays !== undefined && item.repeatEveryDays !== (Number(detail.repeatEveryDays) || 0)) { item.repeatEveryDays = Number(detail.repeatEveryDays) || 0; changed = true; }
          if (detail.plotId !== undefined && item.plotId !== (detail.plotId || '')) { item.plotId = detail.plotId || ''; changed = true; }
        }
      }
      if (changed) persist();
      if (detail.event === 'sent' || detail.event === 'sent_recurring') { setStatus('ESP8266 ส่ง Telegram reminder แล้ว', 'success'); window.farmAnalytics?.recordTask?.('sent', detail); }
      if (detail.event === 'send_failed') setStatus('ESP8266 ส่ง reminder ไม่สำเร็จ จะตรวจอีกครั้งตามรอบ', 'warning');
      renderAll();
    });
    window.addEventListener('reminder:error', event => setStatus(event.detail?.message || 'อ่านสถานะ reminder ไม่สำเร็จ', 'warning'));
    window.cropReminders = { load, sync: syncToDevice, get: snapshot };
    load().catch(error => setStatus(error.message || 'โหลด reminder ไม่สำเร็จ', 'warning'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
