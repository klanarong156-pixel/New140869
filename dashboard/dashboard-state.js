(() => {
  'use strict';

  const config = window.SmartFarmDashboardConfig;
  const relayDefaults = Object.fromEntries(config.relays.map(relay => [relay.id, null]));

  const state = {
    mqtt: {
      status: 'offline',
      reason: 'ยังไม่ได้เชื่อมต่อ',
      error: '',
      reconnectCount: 0,
      connectedAt: 0,
      lastChangeAt: Date.now()
    },
    esp: {
      online: false,
      lastHeartbeatAt: 0,
      lastHeartbeatWasRetained: false,
      heartbeatCount: 0,
      deviceId: '',
      firmware: '',
      rssi: null,
      uptimeSec: null,
      wifi: null,
      mqtt: null,
      raw: null
    },
    sensor: {
      temperature: null,
      humidity: null,
      receivedAt: 0,
      raw: null
    },
    relays: relayDefaults,
    mode: null,
    schedule: {
      enabled: null,
      byRelay: {}
    },
    diagnostic: {
      lastError: '',
      lastErrorAt: 0,
      connectionReason: 'หน้าเว็บเริ่มต้น',
      lastMessageAt: 0
    },
    weather: {
      status: 'loading',
      current: null,
      forecast: [],
      updatedAt: 0,
      error: ''
    }
  };

  const listeners = new Set();

  const clone = value => {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  };

  const emit = event => {
    const snapshot = clone(state);
    listeners.forEach(listener => listener(snapshot, event));
    window.dispatchEvent(new CustomEvent('smartfarm:state', { detail: { state: snapshot, event } }));
  };

  const update = (mutator, event = 'state:update') => {
    mutator(state);
    emit(event);
  };

  const markMqtt = (status, detail = {}) => update(current => {
    current.mqtt.status = status;
    current.mqtt.lastChangeAt = Date.now();
    if (detail.reason !== undefined) current.mqtt.reason = String(detail.reason || '');
    if (detail.error !== undefined) current.mqtt.error = String(detail.error || '');
    if (status === 'connected') {
      current.mqtt.connectedAt = Date.now();
      current.mqtt.error = '';
    }
    if (status === 'connecting') current.mqtt.reconnectCount += detail.reconnect ? 1 : 0;
    current.diagnostic.connectionReason = current.mqtt.reason;
  }, `mqtt:${status}`);

  const setEspOffline = (reason = 'heartbeat-timeout') => update(current => {
    current.esp.online = false;
    current.diagnostic.connectionReason = reason;
  }, 'esp:offline');

  const acceptHeartbeat = (device, { retained = false } = {}) => update(current => {
    const now = Date.now();
    current.esp.raw = device;
    current.esp.deviceId = String(device.device_id || '');
    current.esp.firmware = String(device.firmware || '');
    current.esp.rssi = Number.isFinite(Number(device.rssi)) ? Number(device.rssi) : null;
    current.esp.uptimeSec = Number.isFinite(Number(device.uptimeSec ?? device.uptime)) ? Number(device.uptimeSec ?? device.uptime) : null;
    current.esp.wifi = typeof device.wifi === 'boolean' ? device.wifi : null;
    current.esp.mqtt = typeof device.mqtt === 'boolean' ? device.mqtt : null;
    current.esp.lastHeartbeatAt = now;
    current.esp.lastHeartbeatWasRetained = retained;
    current.esp.heartbeatCount += 1;
    // Firmware retains the latest heartbeat on every publish. It is valid initial
    // state; the watchdog below is what removes liveness when no fresh heartbeat arrives.
    current.esp.online = device.online === true && device.mqtt !== false;
    current.diagnostic.lastMessageAt = now;
  }, retained ? 'esp:retained-heartbeat' : 'esp:heartbeat');

  const acceptOnline = value => {
    if (['false', 'offline', '0', 'no'].includes(String(value).trim().toLowerCase())) {
      setEspOffline('status/online=false');
    }
  };

  const checkHeartbeat = timeoutMs => {
    if (state.mqtt.status !== 'connected') {
      if (state.esp.online) setEspOffline('mqtt-not-connected');
      return false;
    }
    if (!state.esp.lastHeartbeatAt) return false;
    if (Date.now() - state.esp.lastHeartbeatAt <= timeoutMs) {
      if (!state.esp.online && state.esp.raw?.online === true && state.esp.raw?.mqtt !== false) {
        update(current => { current.esp.online = true; }, 'esp:online');
      }
      return state.esp.online;
    }
    if (state.esp.online) setEspOffline('heartbeat-timeout');
    return false;
  };

  const setSensor = sensor => update(current => {
    current.sensor.temperature = Number.isFinite(Number(sensor.temperature)) ? Number(sensor.temperature) : null;
    current.sensor.humidity = Number.isFinite(Number(sensor.humidity)) ? Number(sensor.humidity) : null;
    current.sensor.receivedAt = Date.now();
    current.sensor.raw = sensor;
  }, 'sensor:update');

  const setRelay = (relay, value) => {
    if (!Object.prototype.hasOwnProperty.call(state.relays, relay)) return;
    update(current => { current.relays[relay] = value === true; }, 'relay:status');
  };

  const setMode = mode => {
    const normalized = String(mode || '').toUpperCase();
    if (!['AUTO', 'MANUAL'].includes(normalized)) return;
    update(current => { current.mode = normalized; }, 'mode:status');
  };

  const setSchedule = (relay, schedule) => update(current => {
    current.schedule.byRelay[relay] = schedule;
    const schedules = Object.values(current.schedule.byRelay);
    current.schedule.enabled = schedules.some(item => Array.isArray(item?.slots) && item.slots.some(slot => slot.enabled));
  }, 'schedule:status');

  const setError = error => update(current => {
    current.diagnostic.lastError = String(error?.message || error || 'ไม่ทราบข้อผิดพลาด');
    current.diagnostic.lastErrorAt = Date.now();
  }, 'system:error');

  const setWeather = weather => update(current => {
    current.weather = { ...current.weather, ...weather, updatedAt: Date.now() };
  }, 'weather:update');

  const subscribe = listener => {
    listeners.add(listener);
    listener(clone(state), 'initial');
    return () => listeners.delete(listener);
  };

  const get = () => clone(state);

  window.SmartFarmDashboardState = Object.freeze({
    state,
    get,
    subscribe,
    update,
    markMqtt,
    setEspOffline,
    acceptHeartbeat,
    acceptOnline,
    checkHeartbeat,
    setSensor,
    setRelay,
    setMode,
    setSchedule,
    setError,
    setWeather
  });
})();
