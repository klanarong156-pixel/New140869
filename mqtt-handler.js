class MqttHandler {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.connecting = false;
    this.bootstrapped = false;
    this.deviceTimer = null;
    this.pendingPublishes = [];
    this.lastConnectError = '';
    this.storageUser = 'smartfarm.mqtt.username';
    this.storagePass = 'smartfarm.mqtt.password';
    this.storageRemember = 'smartfarm.mqtt.remember';
  }

  dispatch(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  getCredentials() {
    const configuredUser = String(this.config?.username || '').trim();
    const configuredPass = String(this.config?.password || '');
    if (configuredUser && configuredPass) return { username: configuredUser, password: configuredPass, remember: false };
    const remembered = localStorage.getItem(this.storageRemember) === 'true';
    const store = remembered ? localStorage : sessionStorage;
    return {
      username: store.getItem(this.storageUser) || '',
      password: store.getItem(this.storagePass) || '',
      remember: remembered
    };
  }

  hasCredentials() {
    const credentials = this.getCredentials();
    return Boolean(credentials.username && credentials.password);
  }

  setCredentials(username, password, remember = false) {
    const cleanUser = String(username || '').trim();
    const cleanPass = String(password || '');
    if (!cleanUser || !cleanPass) throw new Error('กรุณากรอก MQTT username และ password ให้ครบ');
    this.clearCredentials(false);
    const store = remember ? localStorage : sessionStorage;
    store.setItem(this.storageUser, cleanUser);
    store.setItem(this.storagePass, cleanPass);
    if (remember) localStorage.setItem(this.storageRemember, 'true');
    else localStorage.removeItem(this.storageRemember);
    this.dispatch('mqtt:credentials-saved', { username: cleanUser, remember: Boolean(remember) });
    return this.connect(true);
  }

  clearCredentials(announce = true) {
    [localStorage, sessionStorage].forEach(store => {
      store.removeItem(this.storageUser);
      store.removeItem(this.storagePass);
    });
    localStorage.removeItem(this.storageRemember);
    this.pendingPublishes = [];
    this.disconnect();
    if (announce) this.dispatch('mqtt:credentials-cleared', true);
  }

  showSetup() {
    if (window.SmartFarmUI?.openMqttSetup) {
      window.SmartFarmUI.openMqttSetup();
      return;
    }
    this.dispatch('mqtt:credentials-required', { configured: false, manual: true });
  }

  disconnect() {
    clearInterval(this.deviceTimer);
    this.deviceTimer = null;
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
    this.connecting = false;
    APP_STATE.mqttConnected = false;
    this.dispatch('mqtt:connected', false);
  }

  setDeviceOnline(online, source = 'mqtt') {
    APP_STATE.espOnline = Boolean(online);
    APP_STATE.espStatusSource = source;
    this.dispatch('esp:status', {
      online: Boolean(online),
      source,
      lastSeen: APP_STATE.espLastSeen
    });
  }

  markDeviceSeen(source = 'heartbeat') {
    APP_STATE.espLastSeen = Date.now();
    this.setDeviceOnline(true, source);
  }

  startDeviceWatchdog() {
    clearInterval(this.deviceTimer);
    this.deviceTimer = setInterval(() => {
      const stale = APP_STATE.espLastSeen && Date.now() - APP_STATE.espLastSeen > this.config.deviceHeartbeatTimeoutMs;
      if (stale) this.setDeviceOnline(false, 'timeout');
    }, 5000);
  }

  connect(force = false) {
    if (typeof mqtt === 'undefined') {
      this.dispatch('mqtt:error', new Error('ไม่พบ MQTT library'));
      return false;
    }
    if (!force && (this.client?.connected || this.connecting)) return true;
    if (force && this.client) this.disconnect();

    const credentials = this.getCredentials();
    if (!credentials.username || !credentials.password) {
      this.dispatch('mqtt:credentials-required', { configured: false });
      return false;
    }

    this.connecting = true;
    this.dispatch('mqtt:connecting', true);
    try {
      this.client = mqtt.connect(this.config.url, {
        clientId: this.config.clientId,
        username: credentials.username,
        password: credentials.password,
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 30000,
        keepalive: 30
      });
    } catch (error) {
      this.connecting = false;
      this.lastConnectError = String(error?.message || error || '');
      this.dispatch('mqtt:error', error);
      return false;
    }

    this.client.on('connect', () => {
      this.connecting = false;
      APP_STATE.mqttConnected = true;
      this.dispatch('mqtt:connected', true);
      this.config.allowedSubscribeTopics.forEach(topic => {
        this.client.subscribe(topic, { qos: 0 }, error => {
          if (error) this.dispatch('mqtt:subscribe-error', { topic, error });
        });
      });
      this.startDeviceWatchdog();
      this.flushPending();
    });
    this.client.on('message', (topic, message) => this.handleMessage(topic, message.toString()));
    this.client.on('close', () => {
      APP_STATE.mqttConnected = false;
      this.connecting = false;
      this.dispatch('mqtt:connected', false);
      if (this.hasCredentials()) this.dispatch('mqtt:reconnecting', true);
    });
    this.client.on('reconnect', () => {
      this.connecting = true;
      this.dispatch('mqtt:reconnecting', true);
    });
    this.client.on('error', error => {
      this.connecting = false;
      this.lastConnectError = String(error?.message || error || '');
      this.dispatch('mqtt:error', error);
    });
    return true;
  }

  bootstrap() {
    if (this.bootstrapped) return;
    this.bootstrapped = true;
    this.startDeviceWatchdog();
    if (this.hasCredentials()) this.connect();
    else this.dispatch('mqtt:credentials-required', { configured: false, initial: true });
  }

  flushPending() {
    if (!this.client?.connected) return;
    const now = Date.now();
    const queue = this.pendingPublishes.splice(0);
    queue.forEach(item => {
      if (now - item.createdAt <= 30000) this.client.publish(item.topic, item.payload, item.options);
    });
  }

  publish(topic, payload, options = {}) {
    if (!topic) return false;
    if (!this.client?.connected) {
      if (!this.hasCredentials()) {
        this.dispatch('mqtt:credentials-required', { configured: false, forPublish: true });
        return false;
      }
      this.pendingPublishes.push({ topic, payload: String(payload), options, createdAt: Date.now() });
      this.connect();
      return true;
    }
    this.client.publish(topic, String(payload), options);
    return true;
  }

  handleMessage(topic, payload) {
    const value = String(payload).trim();
    if (topic.startsWith('smartfarm/relay/') && topic.endsWith('/timer/status')) {
      const relay = topic.split('/')[2];
      if (!RELAYS.includes(relay)) return;
      try {
        const timer = JSON.parse(value);
        const remaining = Math.max(0, Number(timer.remaining) || 0);
        this.markDeviceSeen('relay-timer-status');
        this.dispatch('relay:timer', { relay, active: Boolean(timer.active) && remaining > 0, remaining });
      } catch (_) {
        this.dispatch('relay:timer', { relay, active: false, remaining: 0 });
      }
      return;
    }
    if (topic.startsWith('smartfarm/relay/') && topic.endsWith('/status')) {
      const relay = topic.split('/')[2];
      const on = value.toUpperCase() === 'ON';
      if (RELAYS.includes(relay) && ['ON', 'OFF'].includes(value.toUpperCase())) {
        APP_STATE.relays[relay] = on;
        this.markDeviceSeen('relay-status');
        this.dispatch('relay:status', { relay, status: on });
      }
      return;
    }
    if (topic === this.config.topics.online) {
      if (['true', 'online', '1', 'yes'].includes(value.toLowerCase())) this.markDeviceSeen('presence');
      else this.setDeviceOnline(false, 'last-will');
      return;
    }
    if (topic === this.config.topics.deviceStatus) {
      try {
        const device = JSON.parse(value);
        if (device.online === false) this.setDeviceOnline(false, 'device-status');
        else this.markDeviceSeen('device-status');
        this.dispatch('device:data', device);
      } catch (_) {
        this.markDeviceSeen('device-status');
      }
      return;
    }
    if (topic === this.config.topics.telegramStatus) {
      try {
        this.dispatch('telegram:status', JSON.parse(value));
      } catch (_) {
        this.dispatch('telegram:status', { configured: false });
      }
      return;
    }
    if (topic === this.config.topics.modeStatus) {
      const mode = value.toUpperCase();
      if (mode === 'MANUAL' || mode === 'AUTO') {
        APP_STATE.mode = mode.toLowerCase();
        this.markDeviceSeen('mode-status');
        this.dispatch('mode:status', mode);
      }
      return;
    }
    if (topic.startsWith('smartfarm/schedule/') && topic.endsWith('/status')) {
      const relay = topic.split('/')[2];
      if (!RELAYS.includes(relay)) return;
      try {
        const schedule = JSON.parse(value);
        this.markDeviceSeen('schedule-status');
        this.dispatch('schedule:status', { relay, schedule });
      } catch (_) {
        this.dispatch('schedule:error', { relay, message: 'ข้อมูลตารางเวลาจากอุปกรณ์ไม่ถูกต้อง' });
      }
      return;
    }
    if (topic === this.config.topics.sensor('dht11')) {
      try {
        const sensor = JSON.parse(value);
        this.markDeviceSeen('dht11');
        if (Number.isFinite(Number(sensor.temperature))) this.dispatch('sensor:data', { type: 'temperature', value: Number(sensor.temperature) });
        if (Number.isFinite(Number(sensor.humidity))) this.dispatch('sensor:data', { type: 'humidity', value: Number(sensor.humidity) });
      } catch (_) { /* Ignore malformed sensor packet. */ }
    }
  }
}

window.mqttHandler = new MqttHandler(MQTT_CONFIG);
