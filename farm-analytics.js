(() => {
  'use strict';

  const STORAGE_KEY = 'smartfarm.analytics.v1';
  const MAX_SAMPLES = 360;
  const MAX_EVENTS = 240;
  const state = {
    sensors: [],
    relayEvents: [],
    deviceEvents: [],
    lastSensorWrite: 0,
    lastRemoteWrite: 0,
    lastDevice: null,
    mqtt: false,
    esp: false,
    lastSeenAt: 0
  };

  const $ = id => document.getElementById(id);
  const nowIso = () => new Date().toISOString();
  const safeNumber = value => Number.isFinite(Number(value)) ? Number(value) : null;

  function loadLocal() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      state.sensors = Array.isArray(data.sensors) ? data.sensors.slice(-MAX_SAMPLES) : [];
      state.relayEvents = Array.isArray(data.relayEvents) ? data.relayEvents.slice(-MAX_EVENTS) : [];
      state.deviceEvents = Array.isArray(data.deviceEvents) ? data.deviceEvents.slice(-MAX_EVENTS) : [];
      state.lastDevice = data.lastDevice || null;
      state.lastSeenAt = Number(data.lastSeenAt) || 0;
    } catch (_) {
      state.sensors = [];
      state.relayEvents = [];
      state.deviceEvents = [];
    }
  }

  function snapshot() {
    return {
      sensors: state.sensors.slice(-MAX_SAMPLES),
      relayEvents: state.relayEvents.slice(-MAX_EVENTS),
      deviceEvents: state.deviceEvents.slice(-MAX_EVENTS),
      lastDevice: state.lastDevice,
      lastSeenAt: state.lastSeenAt,
      updatedAt: nowIso()
    };
  }

  function saveLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
  }

  async function saveRemote(force = false) {
    if (!window.FirebaseDB || !window.FirebaseAuth?.user) return;
    if (!force && Date.now() - state.lastRemoteWrite < 300000) return;
    try {
      await FirebaseDB.put('farm/analytics', snapshot());
      state.lastRemoteWrite = Date.now();
    } catch (error) {
      console.warn('บันทึกประวัติ telemetry ไป Firebase ไม่สำเร็จ', error);
    }
  }

  async function loadRemote() {
    if (!window.FirebaseDB || !window.FirebaseAuth?.user) return;
    try {
      const remote = await FirebaseDB.get('farm/analytics');
      if (!remote) return;
      if (Array.isArray(remote.sensors)) state.sensors = remote.sensors.slice(-MAX_SAMPLES);
      if (Array.isArray(remote.relayEvents)) state.relayEvents = remote.relayEvents.slice(-MAX_EVENTS);
      if (Array.isArray(remote.deviceEvents)) state.deviceEvents = remote.deviceEvents.slice(-MAX_EVENTS);
      state.lastDevice = remote.lastDevice || state.lastDevice;
      state.lastSeenAt = Number(remote.lastSeenAt) || state.lastSeenAt;
      saveLocal();
      renderAll();
    } catch (error) {
      console.warn('โหลดประวัติ telemetry จาก Firebase ไม่สำเร็จ', error);
    }
  }

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
  }

  function formatTime(value) {
    if (!value) return 'ยังไม่มีข้อมูล';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'ยังไม่มีข้อมูล' : date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  }

  function addSensor(type, value) {
    const numeric = safeNumber(value);
    if (numeric === null || !['temperature', 'humidity'].includes(type)) return;
    const at = Date.now();
    const last = state.sensors[state.sensors.length - 1];
    const sameType = state.sensors.filter(item => item.type === type).at(-1);
    if (sameType && at - new Date(sameType.at).getTime() < 240000 && Math.abs(Number(sameType.value) - numeric) < (type === 'temperature' ? 0.2 : 1)) return;
    state.sensors.push({ type, value: numeric, at: nowIso() });
    state.sensors = state.sensors.slice(-MAX_SAMPLES);
    saveLocal();
    if (at - state.lastSensorWrite > 300000) {
      state.lastSensorWrite = at;
      saveRemote();
    }
    renderAll();
  }

  function addRelayEvent(relay, on) {
    if (!relay) return;
    state.relayEvents.push({ relay, on: Boolean(on), at: nowIso() });
    state.relayEvents = state.relayEvents.slice(-MAX_EVENTS);
    saveLocal();
    saveRemote();
    renderAll();
  }

  function recordTask(event, detail = {}) {
    state.deviceEvents.push({ type: `task:${event}`, detail, at: nowIso() });
    state.deviceEvents = state.deviceEvents.slice(-MAX_EVENTS);
    saveLocal();
    saveRemote();
  }

  function renderSensors() {
    const latest = type => state.sensors.filter(item => item.type === type).at(-1);
    const temp = latest('temperature');
    const humidity = latest('humidity');
    setText('analyticsTemp', temp ? `${Number(temp.value).toFixed(1)} °C` : '-- °C');
    setText('analyticsHumidity', humidity ? `${Number(humidity.value).toFixed(0)} %` : '-- %');
    setText('analyticsTempAt', formatTime(temp?.at));
    setText('analyticsHumidityAt', formatTime(humidity?.at));
    const samples = state.sensors.filter(item => Date.now() - new Date(item.at).getTime() <= 86400000);
    const avg = type => {
      const list = samples.filter(item => item.type === type).map(item => Number(item.value)).filter(Number.isFinite);
      return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null;
    };
    const avgTemp = avg('temperature');
    const avgHumidity = avg('humidity');
    setText('analyticsTempTrend', avgTemp === null ? 'ยังไม่มีข้อมูล 24 ชม.' : `เฉลี่ย 24 ชม. ${avgTemp.toFixed(1)} °C`);
    setText('analyticsHumidityTrend', avgHumidity === null ? 'ยังไม่มีข้อมูล 24 ชม.' : `เฉลี่ย 24 ชม. ${avgHumidity.toFixed(0)} %`);
    setText('analyticsSampleCount', `${samples.length} จุดข้อมูลใน 24 ชม.`);
  }

  function renderSensorChart() {
    const canvas = $('sensorHistoryChart');
    const empty = $('sensorChartEmpty');
    const meta = $('sensorChartMeta');
    if (!canvas) return;
    const cutoff = Date.now() - 86400000;
    const samples = state.sensors.filter(item => {
      const at = new Date(item.at).getTime();
      return at >= cutoff && Number.isFinite(Number(item.value));
    }).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    if (!samples.length) {
      canvas.hidden = true;
      if (empty) empty.hidden = false;
      if (meta) meta.textContent = 'จะแสดงเมื่อมีข้อมูลจาก DHT11';
      return;
    }
    canvas.hidden = false;
    if (empty) empty.hidden = true;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(300, Math.round(rect.width || 640));
    const height = 230;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const left = 44, right = width - 40, top = 18, bottom = height - 32;
    const plotWidth = right - left, plotHeight = bottom - top;
    const byType = type => samples.filter(item => item.type === type);
    const temp = byType('temperature');
    const humidity = byType('humidity');
    const ranges = {};
    [['temperature', temp], ['humidity', humidity]].forEach(([type, list]) => {
      const values = list.map(item => Number(item.value));
      if (!values.length) return;
      const min = Math.min(...values), max = Math.max(...values);
      const pad = Math.max((max - min) * 0.15, type === 'temperature' ? 1 : 3);
      ranges[type] = { min: min - pad, max: max + pad };
    });
    ctx.font = '12px system-ui, sans-serif';
    ctx.strokeStyle = '#dce7dc';
    ctx.fillStyle = '#6a786d';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = top + (plotHeight * i / 4);
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      const value = ranges.temperature ? ranges.temperature.max - ((ranges.temperature.max - ranges.temperature.min) * i / 4) : 0;
      if (ranges.temperature) ctx.fillText(`${value.toFixed(1)}°`, 2, y + 4);
    }
    const draw = (type, color, unit) => {
      const list = byType(type), range = ranges[type];
      if (!list.length || !range) return;
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath();
      list.forEach((item, index) => {
        const x = left + (plotWidth * (new Date(item.at).getTime() - cutoff) / 86400000);
        const y = top + plotHeight * (1 - (Number(item.value) - range.min) / (range.max - range.min));
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    draw('temperature', '#6d9b76', '°C');
    draw('humidity', '#4c8db8', '%');
    const labels = [0, 6, 12, 18, 24];
    labels.forEach(hours => {
      const x = left + plotWidth * hours / 24;
      const date = new Date(Date.now() - (24 - hours) * 3600000);
      ctx.fillStyle = '#6a786d'; ctx.fillText(date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }), x - 17, height - 10);
    });
    ctx.fillStyle = '#6d9b76'; ctx.fillText('อุณหภูมิ', left + 4, 12);
    ctx.fillStyle = '#4c8db8'; ctx.fillText('ความชื้น', left + 78, 12);
    if (meta) meta.textContent = `${samples.length} จุดข้อมูลใน 24 ชม. · เส้นสีเขียว °C / สีน้ำเงิน %`;
  }

  function relayStats() {
    const names = window.RELAY_NAMES || { pump: 'ปั๊มน้ำ', zone1: 'โซน 1', lighthome: 'ไฟบ้าน', lightsala: 'ไฟศาลา' };
    const cutoff = Date.now() - 86400000;
    const stats = {};
    Object.keys(names).forEach(relay => { stats[relay] = { count: 0, onAt: null, minutes: 0 }; });
    state.relayEvents.filter(item => new Date(item.at).getTime() >= cutoff).forEach(item => {
      if (!stats[item.relay]) stats[item.relay] = { count: 0, onAt: null, minutes: 0 };
      if (item.on) { stats[item.relay].count += 1; stats[item.relay].onAt = new Date(item.at).getTime(); }
      else if (stats[item.relay].onAt) {
        stats[item.relay].minutes += Math.max(0, (new Date(item.at).getTime() - stats[item.relay].onAt) / 60000);
        stats[item.relay].onAt = null;
      }
    });
    return stats;
  }

  function renderRelayStats() {
    const list = $('relayStatsList');
    if (!list) return;
    const names = window.RELAY_NAMES || { pump: 'ปั๊มน้ำ', zone1: 'โซน 1', lighthome: 'ไฟบ้าน', lightsala: 'ไฟศาลา' };
    const stats = relayStats();
    list.replaceChildren();
    Object.keys(names).forEach(relay => {
      const item = stats[relay] || { count: 0, minutes: 0 };
      const row = document.createElement('div');
      row.className = 'relay-stat-row';
      const label = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = names[relay];
      const count = document.createElement('small');
      count.textContent = `${item.count} ครั้งใน 24 ชม.`;
      label.append(title, count);
      const minutes = document.createElement('b');
      minutes.textContent = `${Math.round(item.minutes)} นาที`;
      row.append(label, minutes);
      list.append(row);
    });
  }

  function renderSystem() {
    const device = state.lastDevice || {};
    setText('systemMqttDetail', state.mqtt ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ');
    setText('systemDeviceDetail', state.esp ? 'ออนไลน์' : 'ออฟไลน์');
    setText('systemRssiDetail', Number.isFinite(Number(device.rssi)) ? `${Number(device.rssi)} dBm` : 'รอข้อมูล');
    setText('systemFirmwareDetail', device.firmware || 'รอข้อมูล');
    const heap = device.freeHeap ?? device.heap;
    const frag = Number(device.heapFrag);
    const heapMaxBlock = Number(device.heapMaxBlock);
    const heapText = Number.isFinite(Number(heap)) ? `${Number(heap)} bytes` : 'รอข้อมูล';
    const blockText = Number.isFinite(heapMaxBlock) ? ` · บล็อกใหญ่สุด ${heapMaxBlock}` : '';
    setText('systemHeapDetail', Number.isFinite(frag) ? `${heapText}${blockText} · แตกตัว ${frag}%` : `${heapText}${blockText}`);
    const rtcOk = device.rtcValid === true || device.clockValid === true || device.rtc === true;
    setText('systemRtcDetail', rtcOk ? (device.rtc === true ? 'RTC ถูกต้อง' : 'NTP fallback') : 'รอตรวจสอบ');
    const sensorAge = Number(device.sensorAgeSec);
    const sensorFaults = Number(device.sensorFaults) || 0;
    const sensorOk = device.sensorOk === true || (Number.isFinite(sensorAge) && sensorAge <= 90);
    setText('systemSensorDetail', sensorOk ? `ปกติ · ${Math.max(0, Math.round(sensorAge))} วินาทีที่แล้ว` : `ขัดข้อง · ผิดพลาด ${sensorFaults} ครั้ง`);
    const pumpRuntime = Number(device.pumpRuntimeSec);
    setText('systemPumpDetail', device.pumpSafeLock === true ? 'ล็อกเพื่อความปลอดภัย' : (Number.isFinite(pumpRuntime) && pumpRuntime > 0 ? `กำลังทำงาน ${Math.floor(pumpRuntime / 60)} นาที ${pumpRuntime % 60} วินาที` : 'ปิดอยู่'));
    setText('systemEmergencyDetail', device.emergencyLock === true ? `EMERGENCY STOP ACTIVE${device.emergencySource ? ` · ${String(device.emergencySource).slice(0, 24)}` : ''}` : 'ปกติ');
    const wifiReconnects = Number(device.wifiReconnects) || 0;
    const mqttConnects = Number(device.mqttConnects) || 0;
    const mqttFailures = Number(device.mqttFailures) || 0;
    const resetReason = device.resetReason ? String(device.resetReason).slice(0, 26) : 'ยังไม่ทราบ';
    setText('systemReconnectDetail', `${resetReason} · Wi‑Fi ${wifiReconnects} · MQTT ${mqttConnects}/${mqttFailures}`);
    setText('systemLastSeen', state.lastSeenAt ? formatTime(state.lastSeenAt) : 'ยังไม่มี heartbeat');
    setText('analyticsUpdatedAt', state.sensors.length ? formatTime(state.sensors.at(-1).at) : 'ยังไม่มีข้อมูล');
  }

  const USAGE_KEY = 'smartfarm.usage.v2';
  // Field profile: 2 HP pump, 2-inch pipe, 120 m delivery distance.
  // Flow remains a conservative editable estimate until measured with a flow meter.
  const usage = { flowRate: 20, pumpPower: 1.5, tariff: 4.2, pipeDiameterIn: 2, deliveryDistanceM: 120, resetAt: 0 };

  function loadUsage() {
    try {
      const saved = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
      ['flowRate', 'pumpPower', 'tariff'].forEach(key => {
        const value = Number(saved[key]);
        if (Number.isFinite(value) && value >= 0) usage[key] = value;
      });
      if (Number.isFinite(Number(saved.resetAt)) && Number(saved.resetAt) > 0) {
        usage.resetAt = Number(saved.resetAt);
        setText('usageResetAt', `เริ่มนับใหม่เมื่อ ${new Date(usage.resetAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}`);
      }
    } catch (_) { /* use safe defaults */ }
    ['usageFlowRate', 'usagePumpPower', 'usageTariff'].forEach((id, index) => {
      const element = $(id);
      if (element) element.value = [usage.flowRate, usage.pumpPower, usage.tariff][index];
    });
  }

  const localDate = date => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  };

  function selectedUsageRange() {
    const today = localDate(new Date());
    const fromValue = $('usageDateFrom')?.value || today;
    const toValue = $('usageDateTo')?.value || today;
    const from = new Date(`${fromValue}T00:00:00`).getTime();
    const to = new Date(`${toValue}T23:59:59.999`).getTime();
    return { fromValue, toValue, from, to };
  }

  function usageTotals(from, to) {
    const events = state.relayEvents.filter(item => item.relay === 'pump' && Number.isFinite(new Date(item.at).getTime()))
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    let activeAt = null, minutes = 0, runs = 0;
    events.forEach(item => {
      const at = new Date(item.at).getTime();
      if (at < from) { activeAt = item.on ? from : null; return; }
      if (at > to) return;
      if (item.on && activeAt === null) { activeAt = at; runs += 1; }
      if (!item.on && activeAt !== null) { minutes += Math.max(0, at - activeAt) / 60000; activeAt = null; }
    });
    if (activeAt !== null) minutes += Math.max(0, to - activeAt) / 60000;
    const energy = minutes / 60 * usage.pumpPower;
    return { minutes, runs, liters: minutes * usage.flowRate, energy, cost: energy * usage.tariff };
  }

  function renderUsage() {
    const panel = $('usagePanel');
    if (!panel) return;
    const range = selectedUsageRange();
    const validRange = Number.isFinite(range.from) && Number.isFinite(range.to) && range.from <= range.to;
    // The current view starts at resetAt; an explicitly selected older range still shows archived history.
    const effectiveFrom = usage.resetAt && range.to >= usage.resetAt ? Math.max(range.from, usage.resetAt) : range.from;
    const totals = validRange && effectiveFrom <= Math.min(range.to, Date.now()) ? usageTotals(effectiveFrom, Math.min(range.to, Date.now())) : { minutes: 0, runs: 0, liters: 0, energy: 0, cost: 0 };
    setText('usagePumpMinutes', `${Math.round(totals.minutes)} นาที`);
    setText('usagePumpRuns', `${totals.runs} รอบการทำงาน`);
    setText('usageWaterLiters', `${totals.liters.toFixed(1)} ลิตร`);
    setText('usageEnergyKwh', `${totals.energy.toFixed(2)} kWh`);
    setText('usageElectricCost', `฿${totals.cost.toFixed(2)}`);
    setText('usageFlowNote', `อัตราการไหลประมาณ ${usage.flowRate.toFixed(1)} ลิตร/นาที`);
    setText('usagePowerNote', `กำลังปั๊ม ${usage.pumpPower.toFixed(2)} kW`);
    setText('usageTariffNote', `อัตรา ฿${usage.tariff.toFixed(2)}/kWh · ปั้ม 2 HP`);
    setText('usageRangeStatus', validRange ? `กำลังแสดงข้อมูล ${range.fromValue} ถึง ${range.toValue}${usage.resetAt && range.to >= usage.resetAt ? ' · ยอดปัจจุบันเริ่มหลังรีเซ็ต' : ''} · ${state.relayEvents.filter(item => item.relay === 'pump').length} เหตุการณ์ในประวัติ` : 'กรุณาเลือกวันที่เริ่มต้นไม่เกินวันที่สิ้นสุด');
  }

  function saveUsage() {
    const values = ['usageFlowRate', 'usagePumpPower', 'usageTariff'].map(id => Number($(id)?.value));
    if (values.some(value => !Number.isFinite(value) || value < 0)) {
      setText('usageSettingsStatus', 'กรุณากรอกค่าเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
      return false;
    }
    [usage.flowRate, usage.pumpPower, usage.tariff] = values;
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
    setText('usageSettingsStatus', 'บันทึกค่าคำนวณแล้ว');
    renderUsage();
    return true;
  }

  function renderAll() {
    renderSensors();
    renderSensorChart();
    renderRelayStats();
    renderSystem();
    renderUsage();
  }

  function bind() {
    loadLocal();
    loadUsage();
    const today = localDate(new Date());
    if ($('usageDateFrom')) $('usageDateFrom').value = today;
    if ($('usageDateTo')) $('usageDateTo').value = today;
    $('usageSaveSettings')?.addEventListener('click', saveUsage);
    $('usageRefresh')?.addEventListener('click', () => { renderAll(); setText('usageSettingsStatus', 'รีเฟรชข้อมูลล่าสุดแล้ว'); });
    ['usageDateFrom', 'usageDateTo'].forEach(id => $(id)?.addEventListener('change', renderUsage));
    $('usageReset')?.addEventListener('click', () => {
      if (!window.confirm('เริ่มนับข้อมูลใหม่ตั้งแต่ตอนนี้หรือไม่? ประวัติเดิมจะยังคงอยู่สำหรับดูย้อนหลัง')) return;
      usage.resetAt = Date.now();
      localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
      const now = localDate(new Date());
      if ($('usageDateFrom')) $('usageDateFrom').value = now;
      if ($('usageDateTo')) $('usageDateTo').value = now;
      setText('usageResetAt', `เริ่มนับใหม่แล้วเมื่อ ${new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}`);
      renderAll();
    });
    window.addEventListener('sensor:data', event => addSensor(event.detail?.type, event.detail?.value));
    window.addEventListener('relay:status', event => addRelayEvent(event.detail?.relay, event.detail?.status));
    window.addEventListener('device:data', event => {
      state.lastDevice = { ...(state.lastDevice || {}), ...(event.detail || {}) };
      state.lastSeenAt = Date.now();
      state.deviceEvents.push({ type: 'device', detail: event.detail || {}, at: nowIso() });
      state.deviceEvents = state.deviceEvents.slice(-MAX_EVENTS);
      saveLocal();
      renderAll();
    });
    window.addEventListener('esp:status', event => { state.esp = Boolean(event.detail?.online); state.lastSeenAt = Date.now(); renderSystem(); });
    window.addEventListener('emergency:status', event => { state.lastDevice = { ...(state.lastDevice || {}), ...(event.detail || {}) }; renderSystem(); });
    window.addEventListener('mqtt:connected', event => { state.mqtt = Boolean(event.detail); renderSystem(); });
    window.addEventListener('mqtt:connecting', () => { state.mqtt = false; renderSystem(); });
    window.addEventListener('mqtt:reconnecting', () => { state.mqtt = false; renderSystem(); });
    window.addEventListener('access:ready', () => loadRemote());
    window.farmAnalytics = { get: snapshot, recordTask, refresh: renderAll, clear: () => { state.sensors = []; state.relayEvents = []; state.deviceEvents = []; saveLocal(); renderAll(); } };
    renderAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
