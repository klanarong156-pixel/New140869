(() => {
  'use strict';

  const config = window.SmartFarmDashboardConfig;
  const store = window.SmartFarmDashboardState;
  const mqtt = window.SmartFarmDashboardMqtt;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  const elements = {
    mqttStatus: $('[data-mqtt-status]'),
    espStatus: $('[data-esp-status]'),
    mqttBadge: $('[data-mqtt-badge]'),
    espBadge: $('[data-esp-badge]'),
    credentialPanel: $('[data-credential-panel]'),
    credentialForm: $('[data-credential-form]'),
    username: $('[data-mqtt-username]'),
    password: $('[data-mqtt-password]'),
    credentialError: $('[data-credential-error]'),
    connectButton: $('[data-connect]'),
    disconnectButton: $('[data-disconnect]'),
    toast: $('[data-toast]'),
    espOnline: $('[data-esp-online]'),
    deviceId: $('[data-device-id]'),
    rssi: $('[data-rssi]'),
    firmware: $('[data-firmware]'),
    uptime: $('[data-uptime]'),
    lastHeartbeat: $('[data-last-heartbeat]'),
    temperature: $('[data-temperature]'),
    humidity: $('[data-humidity]'),
    sensorFreshness: $('[data-sensor-freshness]'),
    mode: $('[data-current-mode]'),
    schedule: $('[data-schedule]'),
    diagnosticMqtt: $('[data-diagnostic-mqtt]'),
    diagnosticEsp: $('[data-diagnostic-esp]'),
    diagnosticReason: $('[data-diagnostic-reason]'),
    diagnosticError: $('[data-diagnostic-error]'),
    reconnectCount: $('[data-reconnect-count]'),
    weatherStatus: $('[data-weather-status]'),
    weatherCurrent: $('[data-weather-current]'),
    weatherRain: $('[data-weather-rain]'),
    weatherUpdated: $('[data-weather-updated]'),
    forecast: $('[data-forecast]')
  };

  let toastTimer = null;

  const text = (element, value) => {
    if (element) element.textContent = value;
  };

  const formatNumber = (value, digits = 0) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';

  const formatDuration = seconds => {
    if (!Number.isFinite(Number(seconds))) return '—';
    const total = Math.max(0, Math.floor(Number(seconds)));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours) return `${hours} ชม. ${minutes} นาที`;
    if (minutes) return `${minutes} นาที ${secs} วินาที`;
    return `${secs} วินาที`;
  };

  const elapsed = timestamp => {
    if (!timestamp) return 'ยังไม่มี heartbeat';
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    return `${seconds} วินาทีที่แล้ว`;
  };

  const setTone = (element, tone) => {
    if (element) element.dataset.tone = tone;
  };

  const showToast = (message, tone = 'info') => {
    if (!elements.toast) return;
    elements.toast.textContent = message;
    elements.toast.dataset.tone = tone;
    elements.toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { elements.toast.hidden = true; }, 4200);
  };

  const mqttLabel = status => ({
    connected: 'เชื่อมต่อแล้ว',
    connecting: 'กำลังเชื่อมต่อ',
    offline: 'ออฟไลน์',
    error: 'เกิดข้อผิดพลาด'
  }[status] || 'ออฟไลน์');

  const render = state => {
    const mqttStatus = state.mqtt.status;
    const espOnline = state.esp.online;
    const mqttText = `MQTT · ${mqttLabel(mqttStatus)}`;
    const espText = `ESP8266 · ${espOnline ? 'ออนไลน์' : 'ออฟไลน์'}`;

    text(elements.mqttStatus, mqttText);
    text(elements.espStatus, espText);
    text(elements.mqttBadge, mqttLabel(mqttStatus));
    text(elements.espBadge, espOnline ? 'ออนไลน์' : 'ออฟไลน์');
    setTone(elements.mqttStatus, mqttStatus === 'connected' ? 'good' : mqttStatus === 'error' ? 'bad' : 'warn');
    setTone(elements.espStatus, espOnline ? 'good' : 'bad');
    setTone(elements.mqttBadge, mqttStatus === 'connected' ? 'good' : mqttStatus === 'error' ? 'bad' : 'warn');
    setTone(elements.espBadge, espOnline ? 'good' : 'bad');

    if (elements.credentialPanel) elements.credentialPanel.hidden = mqttStatus === 'connected';
    if (elements.connectButton) elements.connectButton.disabled = mqttStatus === 'connecting';
    if (elements.disconnectButton) elements.disconnectButton.disabled = mqttStatus === 'offline' && !mqtt.client;

    text(elements.espOnline, espOnline ? 'ONLINE' : 'OFFLINE');
    setTone(elements.espOnline, espOnline ? 'good' : 'bad');
    text(elements.deviceId, state.esp.deviceId || 'ยังไม่มีข้อมูล');
    text(elements.rssi, state.esp.rssi === null ? '—' : `${state.esp.rssi} dBm`);
    text(elements.firmware, state.esp.firmware || '—');
    text(elements.uptime, formatDuration(state.esp.uptimeSec));
    text(elements.lastHeartbeat, elapsed(state.esp.lastHeartbeatAt));

    text(elements.temperature, state.sensor.temperature === null ? '—' : `${formatNumber(state.sensor.temperature, 1)} °C`);
    text(elements.humidity, state.sensor.humidity === null ? '—' : `${formatNumber(state.sensor.humidity, 0)} %`);
    text(elements.sensorFreshness, state.sensor.receivedAt ? `DHT11 · ${elapsed(state.sensor.receivedAt)}` : 'DHT11 · ยังไม่มีข้อมูล');

    text(elements.mode, state.mode || '—');
    setTone(elements.mode, state.mode ? 'good' : 'neutral');
    text(elements.schedule, state.schedule.enabled === null ? '—' : state.schedule.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน');
    $$('[data-mode]').forEach(button => {
      button.dataset.active = button.dataset.mode === state.mode ? 'true' : 'false';
      button.disabled = !mqtt.client?.connected;
    });

    text(elements.diagnosticMqtt, mqttLabel(mqttStatus));
    text(elements.diagnosticEsp, espOnline ? 'ONLINE' : 'OFFLINE');
    text(elements.diagnosticReason, state.diagnostic.connectionReason || '—');
    text(elements.diagnosticError, state.diagnostic.lastError || state.mqtt.error || 'ไม่มี');
    text(elements.reconnectCount, String(state.mqtt.reconnectCount));

    config.relays.forEach(relay => {
      const card = document.querySelector(`[data-relay-card="${relay.id}"]`);
      if (!card) return;
      const value = state.relays[relay.id];
      const label = card.querySelector('[data-relay-state]');
      const onButton = card.querySelector('[data-relay-on]');
      const offButton = card.querySelector('[data-relay-off]');
      text(label, value === null ? 'รอข้อมูลจาก ESP8266' : value ? 'เปิด' : 'ปิด');
      card.dataset.state = value === null ? 'unknown' : value ? 'on' : 'off';
      if (onButton) onButton.disabled = !mqtt.client?.connected;
      if (offButton) offButton.disabled = !mqtt.client?.connected;
    });

    renderWeather(state.weather);
  };

  const weatherCode = code => {
    const map = {
      0: 'ท้องฟ้าแจ่มใส', 1: 'เมฆเล็กน้อย', 2: 'มีเมฆบางส่วน', 3: 'มีเมฆมาก',
      45: 'หมอก', 48: 'หมอกจับตัว', 51: 'ฝนปรอยเล็กน้อย', 53: 'ฝนปรอย', 55: 'ฝนปรอยหนัก',
      56: 'ฝนเยือกแข็ง', 57: 'ฝนเยือกแข็ง', 61: 'ฝนเล็กน้อย', 63: 'ฝนปานกลาง', 65: 'ฝนตกหนัก',
      66: 'ฝนเยือกแข็ง', 67: 'ฝนเยือกแข็ง', 71: 'หิมะ', 73: 'หิมะปานกลาง', 75: 'หิมะหนัก',
      77: 'เกล็ดน้ำแข็ง', 80: 'ฝนซู่เล็กน้อย', 81: 'ฝนซู่', 82: 'ฝนซู่หนัก', 95: 'พายุฝนฟ้าคะนอง',
      96: 'พายุฝนฟ้าคะนองมีลูกเห็บ', 99: 'พายุฝนฟ้าคะนองมีลูกเห็บ'
    };
    return map[Number(code)] || 'ไม่ทราบสภาพอากาศ';
  };

  const formatDate = date => {
    try { return new Intl.DateTimeFormat('th-TH', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(date)); }
    catch (_) { return date; }
  };

  const renderWeather = weather => {
    if (!elements.weatherStatus) return;
    if (weather.status === 'loading') {
      text(elements.weatherStatus, 'กำลังโหลดพยากรณ์อากาศ…');
      return;
    }
    if (weather.status === 'error') {
      text(elements.weatherStatus, 'ไม่สามารถโหลดข้อมูลพยากรณ์ได้');
      text(elements.weatherCurrent, '—');
      text(elements.weatherRain, '—');
      text(elements.weatherUpdated, weather.error || 'ลองใหม่ภายหลัง');
      return;
    }
    const current = weather.current || {};
    text(elements.weatherStatus, weatherCode(current.weather_code));
    text(elements.weatherCurrent, Number.isFinite(Number(current.temperature_2m)) ? `${formatNumber(current.temperature_2m, 1)} °C` : '—');
    text(elements.weatherRain, Number.isFinite(Number(current.rain)) ? `${formatNumber(current.rain, 1)} mm` : '0 mm');
    text(elements.weatherUpdated, weather.updatedAt ? `อัปเดต ${elapsed(weather.updatedAt)}` : 'ข้อมูลล่าสุดจากอินเทอร์เน็ต');
    if (elements.forecast) {
      elements.forecast.replaceChildren(...weather.forecast.slice(0, 3).map(day => {
        const item = document.createElement('li');
        item.innerHTML = `<span>${formatDate(day.date)}</span><strong>${formatNumber(day.max, 0)}° / ${formatNumber(day.min, 0)}°</strong><small>${weatherCode(day.code)}</small>`;
        return item;
      }));
    }
  };

  const submitRelay = (relay, desired) => {
    const sent = mqtt.publish(config.topics.relaySet(relay), desired ? 'ON' : 'OFF');
    if (sent) showToast(`${config.relays.find(item => item.id === relay)?.name || relay}: ส่งคำสั่งแล้ว · รอ status จาก ESP8266`, 'info');
    else showToast('ยังส่งคำสั่งไม่ได้ · ตรวจสอบ MQTT Connected และ credentials', 'warn');
  };

  const submitMode = mode => {
    const sent = mqtt.publish(config.topics.modeSet, mode);
    if (sent) showToast(`ส่งคำสั่งโหมด ${mode} แล้ว · รอ status จาก ESP8266`, 'info');
    else showToast('ยังส่งคำสั่งโหมดไม่ได้ · MQTT ยังไม่เชื่อมต่อ', 'warn');
  };

  const loadWeather = async () => {
    const params = new URLSearchParams({
      latitude: String(config.weather.latitude),
      longitude: String(config.weather.longitude),
      current: 'temperature_2m,weather_code,rain',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
      timezone: config.weather.timezone,
      forecast_days: '3'
    });
    try {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const daily = data.daily || {};
      store.setWeather({
        status: 'ready',
        current: data.current || null,
        forecast: (daily.time || []).map((date, index) => ({
          date,
          code: daily.weather_code?.[index],
          max: daily.temperature_2m_max?.[index],
          min: daily.temperature_2m_min?.[index]
        }))
      });
    } catch (error) {
      store.setWeather({ status: 'error', error: `Weather API: ${error.message}` });
    }
  };

  const fillCredentials = () => {
    const credentials = mqtt.readCredentials();
    if (elements.username) elements.username.value = credentials.username || config.mqtt.defaultUsername;
    if (elements.password) elements.password.value = '';
  };

  const bind = () => {
    store.subscribe(render);
    elements.credentialForm?.addEventListener('submit', event => {
      event.preventDefault();
      try {
        mqtt.saveCredentials(elements.username.value, elements.password.value);
        elements.credentialError.hidden = true;
        elements.password.value = '';
        showToast('บันทึก credentials แล้ว · กำลังเชื่อมต่อ', 'info');
      } catch (error) {
        elements.credentialError.hidden = false;
        text(elements.credentialError, error.message);
      }
    });
    elements.connectButton?.addEventListener('click', () => {
      if (!mqtt.hasCredentials()) {
        elements.credentialPanel.hidden = false;
        elements.password?.focus();
        showToast('กรุณากรอก MQTT Password ก่อน', 'warn');
      } else mqtt.connect(true);
    });
    elements.disconnectButton?.addEventListener('click', () => mqtt.disconnect());
    $('[data-clear-credentials]')?.addEventListener('click', () => {
      mqtt.clearCredentials();
      fillCredentials();
      showToast('ล้าง MQTT credentials จากเครื่องนี้แล้ว', 'info');
    });
    $$('[data-relay-on]').forEach(button => button.addEventListener('click', () => submitRelay(button.closest('[data-relay-card]').dataset.relayCard, true)));
    $$('[data-relay-off]').forEach(button => button.addEventListener('click', () => submitRelay(button.closest('[data-relay-card]').dataset.relayCard, false)));
    $$('[data-mode]').forEach(button => button.addEventListener('click', () => submitMode(button.dataset.mode)));
    window.addEventListener('smartfarm:mqtt:credentials-required', event => {
      elements.credentialPanel.hidden = false;
      if (event.detail?.reason && event.detail.reason.includes('ไม่ถูกต้อง')) {
        elements.credentialError.hidden = false;
        text(elements.credentialError, event.detail.reason);
      }
    });
    window.addEventListener('smartfarm:mqtt:error', event => showToast(event.detail?.error || 'MQTT error', 'bad'));
    window.addEventListener('smartfarm:mqtt:subscribe-error', event => showToast(`สมัครรับ topic ไม่สำเร็จ: ${event.detail.topic}`, 'bad'));
    window.setInterval(() => {
      store.checkHeartbeat(config.mqtt.heartbeatTimeoutMs);
      render(store.get());
    }, 1000);
  };

  fillCredentials();
  bind();
  loadWeather();
  mqtt.bootstrap();
})();
