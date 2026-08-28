(() => {
  'use strict';

  const STORAGE_KEY = 'smartfarm.aiAdvisor.v1';
  const MAX_HISTORY = 40;
  const AUTO_COOLDOWN_MS = 15 * 60 * 1000;
  const EVENT_DEBOUNCE_MS = 2500;
  const state = {
    enabled: true,
    history: [],
    latest: null,
    lastSent: Object.create(null),
    lastRunAt: 0,
    timer: null,
    pending: false,
    sensor: { temperature: null, humidity: null },
    weather: null,
    device: null,
    relays: Object.create(null)
  };

  const $ = id => document.getElementById(id);
  const nowIso = () => new Date().toISOString();
  const num = value => Number.isFinite(Number(value)) ? Number(value) : null;

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      state.enabled = data.enabled !== false;
      state.history = Array.isArray(data.history) ? data.history.slice(-MAX_HISTORY) : [];
      state.latest = state.history.at(-1) || null;
    } catch (_) {
      state.history = [];
      state.latest = null;
    }
  }

  function snapshot() {
    return { enabled: state.enabled, history: state.history.slice(-MAX_HISTORY), updatedAt: nowIso() };
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
    if (window.FirebaseDB && window.FirebaseAuth?.user) {
      FirebaseDB.put('farm/aiAdvisor', snapshot()).catch(error => console.warn('บันทึกประวัติ AI ไม่สำเร็จ', error));
    }
  }

  async function loadRemote() {
    if (!window.FirebaseDB || !window.FirebaseAuth?.user) return;
    try {
      const remote = await FirebaseDB.get('farm/aiAdvisor');
      if (Array.isArray(remote?.history)) {
        state.history = remote.history.slice(-MAX_HISTORY);
        state.latest = state.history.at(-1) || null;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
        render();
      }
    } catch (error) { console.warn('โหลดประวัติ AI ไม่สำเร็จ', error); }
  }

  function addFinding(findings, id, severity, title, message, advice) {
    findings.push({ id, severity, title, message, advice });
  }

  function analyze(reason = 'manual') {
    const findings = [];
    const t = state.sensor.temperature;
    const h = state.sensor.humidity;
    const weather = state.weather || window.SmartFarmWeather?.state || {};
    const device = state.device || {};
    const pumpOn = state.relays.pump === true;

    if (t !== null && t >= 38) addFinding(findings, 'high-temperature', 'critical', 'อุณหภูมิสูง', `อุณหภูมิ ${t.toFixed(1)} °C สูงกว่าระดับเฝ้าระวัง`, 'ตรวจร่มเงาและการระบายอากาศ ไม่ควรสั่งปั๊มเพิ่มโดยไม่ตรวจพื้นที่จริง');
    else if (t !== null && t >= 35) addFinding(findings, 'warm-temperature', 'warning', 'อุณหภูมิเริ่มสูง', `อุณหภูมิ ${t.toFixed(1)} °C ควรติดตามใกล้ชิด`, 'ตรวจสภาพใบพืชและความชื้นก่อนตัดสินใจให้น้ำ');
    if (h !== null && h < 30) addFinding(findings, 'low-humidity', 'warning', 'ความชื้นอากาศต่ำ', `ความชื้นอากาศ ${h.toFixed(0)}% ต่ำกว่าระดับเฝ้าระวัง`, 'ตรวจความชื้นดินและสภาพแปลงก่อนเปิดน้ำ');
    if (weather.autoWateringAllowed === false && pumpOn) addFinding(findings, 'rain-with-pump', 'critical', 'ฝนหรือสภาพอากาศไม่เหมาะกับการให้น้ำ', 'ระบบตรวจพบเงื่อนไขป้องกันฝนขณะปั๊มน้ำกำลังทำงาน', 'ตรวจปั๊มและตารางให้น้ำด้วยตนเอง ระบบนี้จะไม่สั่งรีเลย์แทนคุณ');
    if (device.emergencyLock === true) addFinding(findings, 'emergency-lock', 'critical', 'Emergency Stop ทำงานอยู่', 'รีเลย์ถูกล็อกเพื่อความปลอดภัย', 'ตรวจสาเหตุและรีเซ็ตเฉพาะเมื่อพื้นที่ปลอดภัย');
    if (device.rtcValid === false || device.clockValid === false) addFinding(findings, 'rtc-invalid', 'warning', 'ยังยืนยันเวลา RTC ไม่ได้', 'การตัดสินใจตามตารางเวลาอาจไม่แม่นยำ', 'ตรวจ heartbeat และแบตเตอรี่ DS3231');
    if (device.sensorOk === false || (num(device.sensorAgeSec) !== null && Number(device.sensorAgeSec) > 180)) addFinding(findings, 'sensor-stale', 'warning', 'ข้อมูล DHT11 เก่า', 'Dashboard ยังไม่ได้รับค่าความชื้น/อุณหภูมิใหม่ตามปกติ', 'ตรวจสาย DHT11, ไฟเลี้ยง และการเชื่อมต่ออุปกรณ์');
    if (device.emergencyLock !== true && !findings.length) addFinding(findings, 'normal', 'info', 'ฟาร์มอยู่ในเกณฑ์ปกติ', 'ยังไม่พบสัญญาณผิดปกติจากข้อมูลที่ Dashboard มีอยู่', 'ติดตามข้อมูลต่อเนื่องและตรวจพื้นที่จริงตามรอบ');

    const result = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: nowIso(), reason, findings, summary: findings.map(item => item.title).join(' · ') };
    state.latest = result;
    state.history.push(result);
    state.history = state.history.slice(-MAX_HISTORY);
    persist();
    render();
    notify(findings, reason);
    return result;
  }

  function notify(findings, reason) {
    if (!state.enabled || reason === 'manual') return;
    const urgent = findings.find(item => item.severity === 'critical' || item.severity === 'warning');
    if (!urgent || urgent.id === 'normal') return;
    const last = state.lastSent[urgent.id] || 0;
    if (Date.now() - last < AUTO_COOLDOWN_MS) return;
    const topic = window.MQTT_CONFIG?.topics?.aiAlertSet;
    const handler = window.mqttHandler;
    if (!handler?.publish || !topic || !window.APP_STATE?.mqttConnected) return;
    const payload = JSON.stringify({ id: urgent.id, severity: urgent.severity, title: urgent.title, message: `${urgent.message}\nคำแนะนำ: ${urgent.advice}`, at: new Date().toISOString() });
    if (payload.length > 900) return;
    if (handler.publish(topic, payload)) {
      state.lastSent[urgent.id] = Date.now();
      window.farmAnalytics?.recordTask?.('ai_alert_queued', { id: urgent.id, severity: urgent.severity });
      render();
    }
  }

  function schedule(reason) {
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => analyze(reason), EVENT_DEBOUNCE_MS);
  }

  function render() {
    const latest = state.latest;
    const findings = latest?.findings || [];
    const severe = findings.find(item => item.severity === 'critical') || findings.find(item => item.severity === 'warning') || findings[0];
    const status = $('aiAdvisorStatus');
    if (status) status.textContent = severe ? severe.title : 'รอข้อมูลเพื่อวิเคราะห์';
    const detail = $('aiAdvisorDetail');
    if (detail) detail.textContent = severe?.message || 'กดวิเคราะห์เพื่อดูคำแนะนำจากข้อมูลล่าสุด';
    const meta = $('aiAdvisorMeta');
    if (meta) meta.textContent = latest ? `${new Date(latest.at).toLocaleString('th-TH')} · ${latest.findings.length} ประเด็น` : 'ยังไม่มีประวัติ';
    const list = $('aiAdvisorHistory');
    if (list) {
      list.replaceChildren();
      state.history.slice(-5).reverse().forEach(item => {
        const row = document.createElement('div'); row.className = 'ai-history-row';
        const title = document.createElement('strong'); title.textContent = item.summary || 'ผลวิเคราะห์';
        const time = document.createElement('small'); time.textContent = new Date(item.at).toLocaleString('th-TH');
        row.append(title, time); list.append(row);
      });
    }
    const toggle = $('aiAdvisorEnabled'); if (toggle) toggle.checked = state.enabled;
  }

  function bind() {
    load(); render();
    $('aiAdvisorAnalyze')?.addEventListener('click', () => analyze('manual'));
    $('aiAdvisorEnabled')?.addEventListener('change', event => { state.enabled = event.target.checked; persist(); render(); });
    window.addEventListener('sensor:data', event => { const type = event.detail?.type; const value = num(event.detail?.value); if (type && value !== null) { state.sensor[type] = value; schedule('sensor'); } });
    window.addEventListener('weather:protection', event => { state.weather = event.detail?.state || window.SmartFarmWeather?.state || null; schedule('weather'); });
    window.addEventListener('device:data', event => { state.device = { ...(state.device || {}), ...(event.detail || {}) }; schedule('device'); });
    window.addEventListener('relay:status', event => { if (event.detail?.relay) state.relays[event.detail.relay] = event.detail.status === true || event.detail.status === 'ON'; schedule('relay'); });
    window.addEventListener('mqtt:connected', () => { state.pending = false; render(); });
    window.addEventListener('ai:alert-status', event => { state.pending = event.detail?.status === 'queued'; render(); });
    window.addEventListener('access:ready', loadRemote);
    window.setTimeout(() => analyze('startup'), 5000);
  }

  window.farmAiAdvisor = { analyze, get: () => ({ ...state, history: state.history.slice() }), clear: () => { state.history = []; state.latest = null; persist(); render(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true }); else bind();
})();
