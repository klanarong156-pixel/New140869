(function () {
  'use strict';

  const relayNames = window.RELAY_NAMES || {};
  const cache = Object.create(null);
  let activeRelay = 'pump';
  const slots = () => [0, 1, 2, 3];
  const $ = id => document.getElementById(id);

  function emptySlots() {
    return slots().map(() => ({ enabled: false, on: '00:00', off: '00:00' }));
  }

  function normalizeSlots(value) {
    const source = Array.isArray(value?.slots) ? value.slots : Array.isArray(value) ? value : [];
    return slots().map(index => {
      const item = source[index] || {};
      return {
        enabled: Boolean(item.enabled),
        on: /^\d{2}:\d{2}$/.test(String(item.on || '')) ? item.on : '00:00',
        off: /^\d{2}:\d{2}$/.test(String(item.off || '')) ? item.off : '00:00'
      };
    });
  }

  function currentSlots() {
    return slots().map(index => ({
      enabled: Boolean($(`slotEnable${index}`)?.checked),
      on: $(`slotOn${index}`)?.value || '00:00',
      off: $(`slotOff${index}`)?.value || '00:00'
    }));
  }

  function writeSlots(value) {
    normalizeSlots(value).forEach((slot, index) => {
      const enable = $(`slotEnable${index}`);
      const on = $(`slotOn${index}`);
      const off = $(`slotOff${index}`);
      if (enable) enable.checked = slot.enabled;
      if (on) on.value = slot.on;
      if (off) off.value = slot.off;
    });
    updateSummary();
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

  function validate() {
    const data = currentSlots();
    for (let index = 0; index < data.length; index += 1) {
      const slot = data[index];
      if (!slot.enabled) continue;
      if (!/^\d{2}:\d{2}$/.test(slot.on) || !/^\d{2}:\d{2}$/.test(slot.off) || slot.on === slot.off) {
        throw new Error(`ช่วงที่ ${index + 1} ต้องระบุเวลาเปิดและปิดที่ไม่เท่ากัน`);
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
    let payload;
    try {
      payload = validate();
    } catch (error) {
      window.showToast?.(error.message, 'warning');
      return false;
    }
    const sent = window.mqttHandler?.publish?.(MQTT_CONFIG.topics.scheduleSet(activeRelay), JSON.stringify(payload));
    if (!sent) {
      window.showToast?.('ต้องตั้งค่าบัญชี MQTT ก่อนบันทึกตาราง', 'warning');
      window.mqttHandler?.showSetup?.();
      return false;
    }
    cache[activeRelay] = payload;
    updateSummary();
    window.showToast?.(`ส่งตาราง ${relayNames[activeRelay] || activeRelay} ไปยังอุปกรณ์แล้ว`, 'success');
    return true;
  }

  function deleteSchedule() {
    const confirmation = window.confirm(`ลบช่วงเวลาทั้งหมดของ ${relayNames[activeRelay] || activeRelay} หรือไม่?`);
    if (!confirmation) return false;
    const sent = window.mqttHandler?.publish?.(MQTT_CONFIG.topics.scheduleSet(activeRelay), 'DELETE');
    if (!sent) {
      window.showToast?.('ต้องตั้งค่าบัญชี MQTT ก่อนลบตาราง', 'warning');
      window.mqttHandler?.showSetup?.();
      return false;
    }
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

  function bind() {
    document.querySelectorAll('[data-schedule-relay]').forEach(button => button.addEventListener('click', () => switchSchedTab(button.dataset.scheduleRelay)));
    slots().forEach(index => ['slotEnable', 'slotOn', 'slotOff'].forEach(prefix => $(`${prefix}${index}`)?.addEventListener('change', updateSummary)));
    writeSlots(cache[activeRelay] || { slots: emptySlots() });
    switchSchedTab(activeRelay);
    window.addEventListener('schedule:status', event => {
      const relay = event.detail?.relay;
      if (!relay) return;
      cache[relay] = normalizeSlots(event.detail.schedule);
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
