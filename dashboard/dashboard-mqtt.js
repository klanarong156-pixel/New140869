(() => {
  'use strict';

  const config = window.SmartFarmDashboardConfig;
  const appState = window.SmartFarmDashboardState;
  const mqttConfig = config.mqtt;
  const topics = config.topics;
  const credentialEvents = [
    'smartfarm.dashboard.username', 'smartfarm.dashboard.password',
    'smartfarm.mqtt.username', 'smartfarm.mqtt.password'
  ];
  const legacyStorageUsername = 'smartfarm.mqtt.username';
  const legacyStoragePassword = 'smartfarm.mqtt.password';

  const manager = {
    client: null,
    clientId: '',
    lastHeartbeatSignature: '',
    userStopped: false,
    authFailed: false,
    publishSequence: 0,

    dispatch(name, detail) {
      window.dispatchEvent(new CustomEvent(`smartfarm:mqtt:${name}`, { detail }));
    },

    readCredentials() {
      try {
        const username = localStorage.getItem(mqttConfig.storageUsername)
          || localStorage.getItem(legacyStorageUsername)
          || mqttConfig.defaultUsername;
        const password = localStorage.getItem(mqttConfig.storagePassword)
          || localStorage.getItem(legacyStoragePassword)
          || '';
        return {
          username,
          password
        };
      } catch (_) {
        return { username: mqttConfig.defaultUsername, password: '' };
      }
    },

    hasCredentials() {
      const credentials = this.readCredentials();
      return Boolean(credentials.username && credentials.password);
    },

    saveCredentials(username, password) {
      const user = String(username || '').trim();
      const pass = String(password || '');
      if (!user || !pass) throw new Error('กรุณากรอก MQTT Username และ Password ให้ครบ');
      localStorage.setItem(mqttConfig.storageUsername, user);
      localStorage.setItem(mqttConfig.storagePassword, pass);
      // Keep the legacy dashboard and the unified dashboard on one credential source.
      localStorage.setItem(legacyStorageUsername, user);
      localStorage.setItem(legacyStoragePassword, pass);
      this.authFailed = false;
      this.dispatch('credentials-saved', { username: user });
      return this.connect(true);
    },

    clearCredentials() {
      try { credentialEvents.forEach(key => localStorage.removeItem(key)); } catch (_) {}
      this.disconnect('ล้าง MQTT credentials แล้ว');
      this.dispatch('credentials-cleared');
    },

    setStatus(status, detail = {}) {
      appState.markMqtt(status, detail);
      this.dispatch('status', { status, ...detail });
    },

    connect(force = false) {
      if (typeof window.mqtt === 'undefined') {
        this.setStatus('error', { error: 'ไม่พบ MQTT.js ในหน้าเว็บ' });
        this.dispatch('credentials-required', { reason: 'missing-library' });
        return false;
      }

      const credentials = this.readCredentials();
      if (!credentials.username || !credentials.password) {
        this.setStatus('offline', { reason: 'กรุณากรอก MQTT Username และ Password' });
        this.dispatch('credentials-required', { reason: 'missing-credentials' });
        return false;
      }

      if (this.client?.connected && !force) return true;
      if (this.client && !force) return true;
      if (force && this.client) {
        const oldClient = this.client;
        this.client = null;
        try { oldClient.end(true); } catch (_) {}
      }

      this.userStopped = false;
      this.authFailed = false;
      this.lastHeartbeatSignature = '';
      this.clientId = `SmartFarmDashboard-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`;
      this.setStatus('connecting', { reason: 'กำลังเชื่อมต่อ HiveMQ Cloud', reconnect: false });
      this.dispatch('connecting', { url: mqttConfig.url });

      let client;
      try {
        client = window.mqtt.connect(mqttConfig.url, {
          clientId: this.clientId,
          username: credentials.username,
          password: credentials.password,
          clean: true,
          reconnectPeriod: 3000,
          connectTimeout: 30000,
          keepalive: 30,
          protocolVersion: 4
        });
      } catch (error) {
        this.client = null;
        this.setStatus('error', { reason: 'mqtt.connect exception', error: this.errorMessage(error) });
        return false;
      }

      this.client = client;

      client.on('connect', () => {
        if (this.client !== client) return;
        // Firmware publishes the heartbeat with retain=true on every interval.
        // Reset the session marker so only the first snapshot is held offline.
        this.lastHeartbeatSignature = '';
        this.setStatus('connected', { reason: 'HiveMQ Cloud เชื่อมต่อสำเร็จ' });
        this.dispatch('connected');
        this.subscribeAll(client);
      });

      client.on('reconnect', () => {
        if (this.client !== client || this.userStopped || this.authFailed) return;
        this.setStatus('connecting', { reason: 'MQTT.js กำลังเชื่อมต่อใหม่', reconnect: true });
        this.dispatch('reconnecting');
      });

      client.on('offline', () => {
        if (this.client !== client) return;
        appState.setEspOffline('mqtt-offline');
        this.setStatus('offline', { reason: 'MQTT socket offline' });
        this.dispatch('offline');
      });

      client.on('error', error => {
        if (this.client !== client) return;
        const message = this.errorMessage(error);
        const authFailure = /not authorized|unauthori[sz]ed|bad user name or password|bad username|authentication|auth/i.test(message);
        if (authFailure) {
          this.authFailed = true;
          this.userStopped = true;
          this.client = null;
          try { client.end(true); } catch (_) {}
          appState.setEspOffline('mqtt-auth-failed');
          this.setStatus('error', { reason: 'HiveMQ ปฏิเสธ MQTT credentials', error: message });
          this.dispatch('credentials-required', { reason: 'MQTT Username หรือ Password ไม่ถูกต้อง' });
          return;
        }
        this.setStatus('error', { reason: 'MQTT socket error', error: message });
        this.dispatch('error', { error: message });
      });

      client.on('close', () => {
        if (this.client !== client) return;
        if (this.userStopped || this.authFailed) {
          this.client = null;
          this.setStatus('offline', { reason: this.authFailed ? 'หยุด reconnect หลัง credentials ไม่ถูกต้อง' : 'ผู้ใช้ตัดการเชื่อมต่อ' });
          return;
        }
        appState.setEspOffline('mqtt-socket-closed');
        this.setStatus('connecting', { reason: 'socket ปิด · MQTT.js จะเชื่อมต่อใหม่', reconnect: true });
        this.dispatch('closed');
      });

      client.on('message', (topic, payload, packet) => {
        if (this.client === client) this.handleMessage(String(topic), payload.toString(), packet);
      });

      return true;
    },

    disconnect(reason = 'ผู้ใช้ตัดการเชื่อมต่อ') {
      this.userStopped = true;
      this.authFailed = false;
      const client = this.client;
      this.client = null;
      try { client?.end(true); } catch (_) {}
      appState.setEspOffline('mqtt-disconnected');
      this.setStatus('offline', { reason });
      this.dispatch('disconnected', { reason });
    },

    subscribeAll(client) {
      mqttConfig.allowedSubscribeTopics.forEach(topic => {
        client.subscribe(topic, { qos: 0 }, error => {
          if (error) this.dispatch('subscribe-error', { topic, error: this.errorMessage(error) });
          else this.dispatch('subscribed', { topic });
        });
      });
    },

    publish(topic, payload) {
      if (!this.client?.connected) {
        this.dispatch('publish-blocked', { topic, reason: 'MQTT ยังไม่เชื่อมต่อ' });
        return false;
      }
      const requestId = `${Date.now()}-${++this.publishSequence}`;
      try {
        this.client.publish(topic, String(payload), { qos: 1, retain: false }, error => {
          if (error) this.dispatch('publish-error', { topic, requestId, error: this.errorMessage(error) });
          else this.dispatch('published', { topic, requestId });
        });
        return true;
      } catch (error) {
        this.dispatch('publish-error', { topic, requestId, error: this.errorMessage(error) });
        return false;
      }
    },

    errorMessage(error) {
      return String(error?.message || error?.reason || error || 'MQTT error');
    },

    parseJson(payload) {
      try { return JSON.parse(payload); } catch (_) { return null; }
    },

    parseDevicePayload(payload) {
      const parsed = this.parseJson(payload);
      if (parsed) return parsed;
      // Older firmware used a 512-byte output buffer and could truncate the
      // tail of status/device. Recover only the identity/liveness fields that
      // are emitted at the beginning; the watchdog still enforces freshness.
      const text = String(payload);
      const id = text.match(/"device_id"\s*:\s*"([^"\\]*)/);
      if (!id || !/"online"\s*:\s*true/.test(text) || !/"mqtt"\s*:\s*true/.test(text)) return null;
      const firmware = text.match(/"firmware"\s*:\s*"([^"\\]*)/);
      const uptime = text.match(/"uptimeSec"\s*:\s*(\d+)/) || text.match(/"uptime"\s*:\s*(\d+)/);
      const rssi = text.match(/"rssi"\s*:\s*(-?\d+)/);
      return { device_id: id[1], online: true, mqtt: true,
        ...(firmware ? { firmware: firmware[1] } : {}),
        ...(uptime ? { uptimeSec: Number(uptime[1]) } : {}),
        ...(rssi ? { rssi: Number(rssi[1]) } : {}), payloadTruncated: true };
    },

    handleMessage(topic, payload, packet = {}) {
      const retained = Boolean(packet?.retain);
      const value = String(payload).trim();
      const state = appState.get();

      if (topic === topics.online) {
        appState.acceptOnline(value);
        return;
      }

      if (topic === topics.device) {
        const device = this.parseDevicePayload(value);
        if (!device || typeof device !== 'object') return;
        if (device.online === false) appState.setEspOffline('status/device=false');
        else {
          const uptime = device.uptimeSec ?? device.uptime ?? '';
          const signature = `${device.device_id || ''}|${uptime}|${device.time || ''}`;
          const firstSnapshot = !this.lastHeartbeatSignature;
          this.lastHeartbeatSignature = signature;
          // The V7 firmware sets retain=true on each heartbeat publish. The
          // first packet after connect is the broker snapshot; a changed
          // uptime proves a subsequent packet is a fresh heartbeat.
          appState.acceptHeartbeat(device, { retained: retained && firstSnapshot });
        }
        return;
      }

      if (topic === topics.dht11) {
        const sensor = this.parseJson(value);
        if (sensor) appState.setSensor(sensor);
        return;
      }

      if (topic.endsWith('/status') && topic.startsWith('smartfarm/relay/')) {
        const relay = topic.split('/')[2];
        if (state.relays && Object.prototype.hasOwnProperty.call(state.relays, relay) && /^(ON|OFF)$/i.test(value)) {
          appState.setRelay(relay, value.toUpperCase() === 'ON');
        }
        return;
      }

      if (topic === topics.modeStatus) {
        appState.setMode(value);
        return;
      }

      if (topic.startsWith('smartfarm/schedule/') && topic.endsWith('/status')) {
        const relay = topic.split('/')[2];
        const schedule = this.parseJson(value);
        if (schedule) appState.setSchedule(relay, schedule);
        return;
      }

      if (topic === topics.error) {
        appState.setError(this.parseJson(value) || value);
        return;
      }

      if (topic === topics.emergencyStatus) {
        const emergency = this.parseJson(value);
        if (emergency) appState.setEmergency(emergency);
        return;
      }

      if (topic === topics.time) {
        const time = this.parseJson(value);
        if (time) appState.setTime(time);
        return;
      }

      if (topic === topics.telegramStatus || topic === topics.reminderStatus || topic === topics.aiAlertStatus) {
        window.dispatchEvent(new CustomEvent('smartfarm:device-status', { detail: { topic, payload: this.parseJson(value) || value } }));
        return;
      }
    },

    bootstrap() {
      if (this.hasCredentials()) this.connect();
      else {
        this.setStatus('offline', { reason: 'ยังไม่ได้กรอก MQTT Password' });
        this.dispatch('credentials-required', { reason: 'missing-credentials' });
      }
    }
  };

  window.SmartFarmDashboardMqtt = manager;
})();
