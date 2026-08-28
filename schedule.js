(function () {
  'use strict';

  const relayNames = window.RELAY_NAMES || {};
  const cache = Object.create(null);
  let activeRelay = 'pump';
  let pendingSchedule = null;
  const SCHEDULE_PUBLISH_GUARD_MS = 8000;
  const slots = () => [0, 1, 2, 3];
  const $ = id => document.getElementById(id);

  function emptySlots() {
    return slots().map(() => ({ enabled: false, on: '00:00', off: '00:00' }));
  }

  function normalizeSlots(value) {
    const source = Array.isArray(value?.slots) ? value.slots : Array.isArray(value) ? value : [];
    return slots().map(index => {
      const item = source[index] || {};
      const on = String(item.on || '');
      const off = String(item.off || '');
      const validOn = timeToMinutes(on) >= 0;
      const validOff = timeToMinutes(off) >= 0;
      return {
        enabled: Boolean(item.enabled) && validOn && validOff && on !== off,
        on: validOn ? on : '00:00',
        off: validOff ? off : '00:00'
      };
    });
  }

  function currentSlots() {
    return slots().map(index => {
      const on = $(`slotOn${index}`)?.value || '00:00';
      const off = $(`slotOff${index}`)?.value || '00:00';
      return {
        // The approved UI has no separate checkbox: any non-empty interval is
        // validated as a candidate; 00:00–00:00 remains the unused value.
        enabled: on !== off,
        on,
        off
      };
    });
  }

  function timeToMinutes(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return -1;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours < 24 && minutes < 60 ? hours * 60 + minutes : -1;
  }

  function scheduleKey(value) {
    return JSON.stringify(normalizeSlots(value));
  }

  function emptyScheduleKey() {
    return scheduleKey({ slots: emptySlots() });
  }

  function clearExpiredPending() {
    if (pendingSchedule && Date.now() - pendingSchedule.startedAt >= SCHEDULE_PUBLISH_GUARD_MS) pendingSchedule = null;
  }

  function scheduleAckMatches(relay, value) {
    clearExpiredPending();
    if (!pendingSchedule || pendingSchedule.relay !== relay) return false;
    const key = pendingSchedule.command === 'DELETE' ? emptyScheduleKey() : scheduleKey(value);
    if (key !== pendingSchedule.key) return false;
    pendingSchedule = null;
    return true;
  }

  function slotIsOn(slot, minute) {
    if (!slot.enabled) return false;
    const on = timeToMinutes(slot.on);
    const off = timeToMinutes(slot.off);
    if (on < 0 || off < 0 || on === off) return false;
    return on < off ? minute >= on && minute < off : minute >= on || minute < off;
  }

  function slotsOverlap(a, b) {
    for (let minute = 0; minute < 1440; minute += 1) {
      if (slotIsOn(a, minute) && slotIsOn(b, minute)) return true;
    }
    return false;
  }

  function writeSlots(value) {
    normalizeSlots(value).forEach((slot, index) => {
      const on = $(`slotOn${index}`);
      const off = $(`slotOff${index}`);
      if (on) on.value = slot.on;
      if (off) off.value = slot.off;
    });
    updateSummary();
  }

  function setValidation(message) {
    const box = $('scheduleValidation');
    if (!box) return;
    box.textContent = message || '';
    box.hidden = !message;
  }

  function updateSummary() {
    const summary = $('schedSummary');
    if (!summary) return;
    const enabled = currentSlots().filter(slot => slot.enabled);
    if (!enabled.length) {
      summary.textContent = 'ยังไม่มีช่วงเวลาที่เปิดใช้งานสำหรับอุปกรณ์นี้';
      return;
    }
    summary.textContent = `ตั้งไว้ ${enabled.length} ช่วงเวลา: ${enabled.map(slot => `${slot.on}–${slot.off}`).join(', ')}`;
  }

  function applyQuickSchedule(value) {
    const [on, off] = String(value || '').split('|');
    if (timeToMinutes(on) < 0 || timeToMinutes(off) < 0 || on === off) return false;
    writeSlots({ slots: [{ enabled: true, on, off }, ...emptySlots().slice(1)] });
    document.querySelectorAll('[data-quick-schedule]').forEach(button => button.classList.toggle('active', button.dataset.quickSchedule === value));
    window.showToast?.(`เลือกเวลา ${on}–${off} แล้ว กดบันทึกตาราง`, 'success');
    return true;
  }

  function validate() {
    const data = currentSlots();
    setValidation('');
    for (let index = 0; index < data.length; index += 1) {
      const slot = data[index];
      if (!slot.enabled) continue;
      if (timeToMinutes(slot.on) < 0 || timeToMinutes(slot.off) < 0 || slot.on === slot.off) {
        const message = `ช่วงที่ ${index + 1} ต้องระบุเวลาเปิดและปิดที่ไม่เท่ากัน`;
        setValidation(message);
        throw new Error(message);
      }
      for (let other = index + 1; other < data.length; other += 1) {
        if (slotsOverlap(slot, data[other])) {
          const message = `ช่วงที่ ${index + 1} ชนกับช่วงที่ ${other + 1} กรุณาแก้เวลาให้ไม่ทับกัน`;
          setValidation(message);
          throw new Error(message);
        }
      }
    }
    return { slots: data };
  }

  function switchSchedTab(relay) {
    if (!window.RELAYS?.includes(relay)) return false;
    cache[activeRelay] = { slots: currentSlots() };
    activeRelay = relay;
    document.querySelectorAll('[data-schedule-relay]').forEach(button => button.classList.toggle('active', button.dataset.scheduleRelay === relay));
    const title = $('scheduleRelayTitle');
    const caption = $('scheduleRelayCaption');
    if (title) title.textContent = `ตารางเวลา: ${relayNames[relay] || relay}`;
    if (caption) caption.textContent = `ระบบจะส่งตารางนี้ไปเก็บใน ESP8266 สำหรับ ${relayNames[relay] || relay}`;
    writeSlots(cache[relay] || { slots: emptySlots() });
    return true;
  }

  function saveSchedule() {
    clearExpiredPending();
    let payload;
    try {
      payload = validate();
    } catch (error) {
      window.showToast?.(error.message, 'warning');
      return false;
    }
    const key = scheduleKey(payload);
    if (pendingSchedule) {
      window.showToast?.('กำลังบันทึกตาราง รออุปกรณ์ตอบกลับก่อน', 'warning');
      return false;
    }
    const sent = window.mqttHandler?.publish?.(MQTT_CONFIG.topics.scheduleSet(activeRelay), JSON.stringify(payload));
    if (!sent) {
      window.showToast?.('ต้องตั้งค่าบัญชี MQTT ก่อนบันทึกตาราง', 'warning');
      window.mqttHandler?.showSetup?.();
      return false;
    }
    pendingSchedule = { relay: activeRelay, key, command: 'SAVE', startedAt: Date.now() };
    cache[activeRelay] = payload;
    updateSummary();
    setValidation('');
    window.showToast?.(`ส่งตาราง ${relayNames[activeRelay] || activeRelay} ไปยังอุปกรณ์แล้ว`, 'success');
    return true;
  }

  function deleteSchedule() {
    clearExpiredPending();
    const confirmation = window.confirm(`ลบช่วงเวลาทั้งหมดของ ${relayNames[activeRelay] || activeRelay} หรือไม่?`);
    if (!confirmation) return false;
    if (pendingSchedule) {
      window.showToast?.('กำลังบันทึกตาราง รออุปกรณ์ตอบกลับก่อน', 'warning');
      return false;
    }
    const sent = window.mqttHandler?.publish?.(MQTT_CONFIG.topics.scheduleSet(activeRelay), 'DELETE');
    if (!sent) {
      window.showToast?.('ต้องตั้งค่าบัญชี MQTT ก่อนลบตาราง', 'warning');
      window.mqttHandler?.showSetup?.();
      return false;
    }
    pendingSchedule = { relay: activeRelay, key: emptyScheduleKey(), command: 'DELETE', startedAt: Date.now() };
    cache[activeRelay] = { slots: emptySlots() };
    writeSlots(cache[activeRelay]);
    window.showToast?.(`ลบตาราง ${relayNames[activeRelay] || activeRelay} แล้ว`, 'success');
    return true;
  }

  function removeScheduleSlot(index) {
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i > 3) return false;
    const enable = $(`slotEnable${i}`);
    const on = $(`slotOn${i}`);
    const off = $(`slotOff${i}`);
    if (enable) enable.checked = false;
    if (on) on.value = '00:00';
    if (off) off.value = '00:00';
    updateSummary();
    window.showToast?.(`ล้างช่วงเวลาที่ ${i + 1} แล้ว`, 'success');
    return true;
  }

  function formatCropDate(value) {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? 'ไม่ระบุวันที่' : date.toLocaleDateString('th-TH', { dateStyle: 'long' });
  }

  function renderCropCycle(data) {
    const summary = $('cropCycleSummary');
    if (!summary) return;
    const age = window.cropCycle?.age(data) || 0;
    summary.replaceChildren();
    const icon = document.createElement('span');
    icon.textContent = '🌱';
    const content = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = data.crop ? `${data.crop} · ปลูกมาแล้ว ${age} วัน` : 'ยังไม่ได้บันทึกรอบปลูก';
    const lineBreak = document.createElement('br');
    const detail = document.createElement('small');
    detail.textContent = data.startDate ? `วันที่ปลูก ${formatCropDate(data.startDate)}` : 'กรอกชื่อพืชและวันที่ปลูกเพื่อเริ่มนับวัน';
    content.append(title, lineBreak, detail);
    summary.append(icon, content);
  }

  async function loadCropCycle() {
    if (!window.cropCycle) return;
    const data = await window.cropCycle.load();
    if ($('cropName')) $('cropName').value = data.crop || '';
    if ($('cropStartDate')) $('cropStartDate').value = data.startDate || '';
    renderCropCycle(data);
  }

  async function saveCropCycle(event) {
    event.preventDefault();
    const button = $('cropCycleSubmit');
    button.disabled = true;
    try {
      const data = await window.cropCycle.save($('cropStartDate').value, $('cropName').value);
      renderCropCycle(data);
      window.showToast?.('บันทึกรอบปลูกแล้ว', 'success');
    } catch (error) {
      window.showToast?.(error.message || 'บันทึกรอบปลูกไม่สำเร็จ', 'error');
    } finally {
      button.disabled = false;
    }
  }

  function bindCropCycle() {
    $('cropCycleForm')?.addEventListener('submit', saveCropCycle);
    loadCropCycle().catch(error => window.showToast?.(error.message || 'โหลดข้อมูลรอบปลูกไม่สำเร็จ', 'warning'));
  }

  function bind() {
    document.querySelectorAll('[data-schedule-relay]').forEach(button => button.addEventListener('click', () => switchSchedTab(button.dataset.scheduleRelay)));
    document.querySelectorAll('[data-quick-schedule]').forEach(button => button.addEventListener('click', () => applyQuickSchedule(button.dataset.quickSchedule)));
    slots().forEach(index => ['slotOn', 'slotOff'].forEach(prefix => $(`${prefix}${index}`)?.addEventListener('change', updateSummary)));
    writeSlots(cache[activeRelay] || { slots: emptySlots() });
    switchSchedTab(activeRelay);
    bindCropCycle();
    window.addEventListener('schedule:status', event => {
      const relay = event.detail?.relay;
      if (!relay) return;
      const normalized = normalizeSlots(event.detail.schedule);
      scheduleAckMatches(relay, normalized);
      cache[relay] = normalized;
      if (relay === activeRelay) writeSlots(cache[relay]);
    });
    window.addEventListener('schedule:error', event => window.showToast?.(event.detail?.message || 'ไม่สามารถอ่านตารางจากอุปกรณ์ได้', 'warning'));
  }

  window.switchSchedTab = switchSchedTab;
  window.saveSchedule = saveSchedule;
  window.deleteSchedule = deleteSchedule;
  window.removeScheduleSlot = removeScheduleSlot;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
