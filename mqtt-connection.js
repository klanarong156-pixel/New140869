/* SmartFarm MQTT Connection V2
 * Single connection owner for the browser.
 * Contract is derived from SmartFarm_V7.1.1-TLS-TIME-FIX firmware.
 * No SharedWorker. No second reconnect loop.
 */
(() => {
  'use strict';

  const handler = {
    client: null,
    connecting: false,
    bootstrapped: false,
    reconnectTimer: null,
    lastConnectError: '',
    publishSequence: 0,
    pendingPublishes: [],
    deviceTimer: null,
    lastHeartbeatUptime: null,
    heartbeatSeenCount: 0,
    storageUser: 'smartfarm.mqtt.username',
    storagePass: 'smartfarm.mqtt.password',
    diagnosticState: {
      state: 'disconnected',
      lastConnectedAt: 0,
      lastDisconnectedAt: 0,
      reconnectCount: 0,
      lastReason: 'initial',
      lastError: '',
      disconnectOrigin: 'initial'
    },

    dispatch(name, detail) {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    },

    updateDiagnostic(state, detail = {}) {
      const now = Date.now();
      const previous = this.diagnosticState.state;
      if (state === 'connected') this.diagnosticState.lastConnectedAt = now;
      if (state === 'disconnected') this.diagnosticState.lastDisconnectedAt = now;
      if (state === 'reconnecting' && previous !== 'reconnecting') this.diagnosticState.reconnectCount += 1;
      this.diagnosticState.state = state;
      if (detail.reason) this.diagnosticState.lastReason = String(detail.reason);
      if (detail.error) this.diagnosticState.lastError = String(detail.error);
      if (detail.origin) this.diagnosticState.disconnectOrigin = String(detail.origin);
      this.dispatch('mqtt:diagnostic', { state, timestamp: now, previousState: previous, ...this.diagnosticState });
    },

    errorMessage(error, fallback = 'MQTT error') {
      return String(error?.message || error?.reason || error || fallback);
    },

    nextPublishId() {
      this.publishSequence += 1;
      return `${Date.now()}-${this.publishSequence}`;
    },

    getCredentials() {
      const configuredUser = String(this.config?.username || '').trim();
      const configuredPass = String(this.config?.password || '');
      if (configuredUser && configuredPass) return { username: configuredUser, password: configuredPass, remember: false };
      try {
        return {
          username: localStorage.getItem(this.storageUser) || this.config?.defaultUsername || '',
          password: localStorage.getItem(this.storagePass) || '',
          remember: true
        };
      } catch (_) {
        return { username: '', password: '', remember: false };
      }
    },

    getCredentialStatus() {
      const c = this.getCredentials();
      return {
        complete: Boolean(c.username && c.password),
        usernamePresent: Boolean(c.username),
        passwordPresent: Boolean(c.password),
        storage: c.remember ? 'localStorage' : 'config',
        remember: c.remember,
        missing: [...(!c.username ? ['username'] : []), ...(!c.password ? ['password'] : [])]
      };
    },

    hasCredentials() {
      return this.getCredentialStatus().complete;
    },

    setCredentials(username, password) {
      const user = String(username || '').trim();
      const pass = String(password || '');
      if (!user || !pass) throw new Error('กรุณากรอก MQTT username และ password ให้ครบ');
      try {
        localStorage.setItem(this.storageUser, user);
        localStorage.setItem(this.storagePass, pass);
      } catch (_) {
        throw new Error('ไม่สามารถบันทึก MQTT credentials ในเบราว์เซอร์ได้');
      }
      this.dispatch('mqtt:credentials-saved', { username: user, remember: true, status: this.getCredentialStatus() });
      return this.connect(true);
    },

    clearCredentials(announce = true) {
      try {
        localStorage.removeItem(this.storageUser);
        localStorage.removeItem(this.storagePass);
        sessionStorage.removeItem(this.storageUser);
        sessionStorage.removeItem(this.storagePass);
      } catch (_) {}
      this.pendingPublishes = [];
      this.disconnect('credentials-cleared');
      if (announce) this.dispatch('mqtt:credentials-cleared', true);
    },

    clearReconnectTimer() {
      if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    },

    setDeviceOnline(online, source = 'mqtt') {
      APP_STATE.espOnline = Boolean(online);
      APP_STATE.espStatusSource = source;
      this.dispatch('esp:status', { online: Boolean(online), source, lastSeen: APP_STATE.espLastSeen });
    },

    markDeviceSeen(source = 'heartbeat') {
      APP_STATE.espLastSeen = Date.now();
      this.setDeviceOnline(true, source);
    },

    startDeviceWatchdog() {
      window.clearInterval(this.deviceTimer);
      this.deviceTimer = window.setInterval(() => {
        if (!APP_STATE.espLastSeen) return;
        if (Date.now() - APP_STATE.espLastSeen > Number(this.config.deviceHeartbeatTimeoutMs || 25000)) {
          this.setDeviceOnline(false, 'heartbeat-timeout');
        }
      }, 3000);
    },

    isImportantCommand(topic) {
      return /^(?:smartfarm\/relay\/[^/]+\/(?:set|timer\/set)|smartfarm\/schedule\/[^/]+\/set|smartfarm\/(?:emergency|mode)\/set|smartfarm\/config\/telegram\/(?:set|test)|smartfarm\/reminder\/set|smartfarm\/ai\/alert\/set)$/.test(String(topic || ''));
    },

    publishOptions(topic, options = {}) {
      const important = this.isImportantCommand(topic);
      return {
        ...options,
        qos: important ? 1 : Math.max(0, Math.min(2, Number(options.qos) || 0)),
        retain: important ? false : Boolean(options.retain)
      };
    },

    dispatchCommandStatus(state, detail = {}) {
      this.dispatch('mqtt:command-status', {
        state,
        important: this.isImportantCommand(detail.topic),
        ...detail
      });
    },

    publishDirect(topic, payload, options, requestId) {
      if (!this.client?.connected) return false;
      try {
        this.client.publish(topic, payload, options, (error, packet) => {
          if (error) {
            this.dispatchCommandStatus('error', { requestId, topic, error: this.errorMessage(error, 'MQTT publish failed') });
            this.dispatch('mqtt:publish-error', { requestId, topic, error });
            return;
          }
          this.dispatchCommandStatus('acknowledged', { requestId, topic, qos: packet?.qos ?? options?.qos ?? 0 });
          this.dispatch('mqtt:publish-ack', { requestId, topic, packet });
        });
        return true;
      } catch (error) {
        this.dispatchCommandStatus('error', { requestId, topic, error: this.errorMessage(error) });
        this.dispatch('mqtt:publish-error', { requestId, topic, error });
        return false;
      }
    },

    flushPending() {
      if (!this.client?.connected) return;
      const now = Date.now();
      const queue = this.pendingPublishes.splice(0);
      queue.forEach(item => {
        if (now - item.createdAt <= 30000) this.publishDirect(item.topic, item.payload, item.options, item.requestId);
      });
    },

    subscribeAll(client) {
      for (const topic of this.config.allowedSubscribeTopics) {
        client.subscribe(topic, { qos: 0 }, error => {
          if (error) {
            this.dispatch('mqtt:subscribe-error', { topic, error: new Error(this.errorMessage(error, 'MQTT subscribe failed')) });
          }
        });
      }
    },

    connect(force = false) {
      const credentials = this.getCredentials();
      if (!credentials.username || !credentials.password) {
        this.connecting = false;
        this.dispatch('mqtt:credentials-required', { configured: false, status: this.getCredentialStatus() });
        return false;
      }

      if (!force && (this.client?.connected || this.connecting)) return true;

      if (force && this.client) {
        try { this.client.end(true); } catch (_) {}
        this.client = null;
      }

      if (typeof mqtt === 'undefined') {
        this.lastConnectError = 'ไม่พบ MQTT library (mqtt.min.js)';
        this.updateDiagnostic('disconnected', { reason: 'MQTT.js unavailable', error: this.lastConnectError, origin: 'browser' });
        this.dispatch('mqtt:error', { message: this.lastConnectError, connected: false, transient: false });
        return false;
      }

      this.clearReconnectTimer();
      this.connecting = true;
      this.lastHeartbeatUptime = null;
      this.heartbeatSeenCount = 0;
      APP_STATE.mqttConnected = false;
      this.updateDiagnostic('reconnecting', { reason: 'connecting to HiveMQ Cloud', origin: 'browser' });
      this.dispatch('mqtt:connecting', { url: this.config.url, username: credentials.username });

      let client;
      try {
        client = mqtt.connect(this.config.url, {
          clientId: this.config.clientId,
          username: credentials.username,
          password: credentials.password,
          clean: true,
          reconnectPeriod: 3000,
          connectTimeout: 30000,
          keepalive: 30
        });
      } catch (error) {
        this.connecting = false;
        this.lastConnectError = this.errorMessage(error, 'MQTT connect failed');
        this.updateDiagnostic('disconnected', { reason: 'mqtt.connect exception', error: this.lastConnectError, origin: 'browser' });
        this.dispatch('mqtt:error', { message: this.lastConnectError, connected: false, transient: false });
        return false;
      }

      this.client = client;

      client.on('connect', () => {
        if (this.client !== client) return;
        this.connecting = false;
        this.lastConnectError = '';
        APP_STATE.mqttConnected = true;
        this.updateDiagnostic('connected', { reason: 'HiveMQ connection established', origin: 'browser', error: '' });
        this.dispatch('mqtt:connected', true);
        this.subscribeAll(client);
        this.startDeviceWatchdog();
        this.flushPending();
      });

      client.on('message', (topic, message) => {
        if (this.client === client) this.handleMessage(topic, message.toString());
      });

      client.on('reconnect', () => {
        if (this.client !== client) return;
        this.connecting = true;
        this.updateDiagnostic('reconnecting', { reason: 'MQTT.js automatic reconnect', origin: 'browser' });
        this.dispatch('mqtt:reconnecting', { delay: 3000 });
      });

      client.on('offline', () => {
        if (this.client !== client) return;
        this.connecting = true;
        APP_STATE.mqttConnected = false;
        this.updateDiagnostic('reconnecting', { reason: 'MQTT.js offline', origin: 'socket' });
        this.dispatch('mqtt:connected', false);
        this.dispatch('mqtt:reconnecting', { delay: 3000 });
      });

      client.on('error', error => {
        if (this.client !== client) return;
        this.lastConnectError = this.errorMessage(error, 'MQTT socket error');
        this.updateDiagnostic('reconnecting', { reason: 'MQTT error', error: this.lastConnectError, origin: 'socket' });
        this.dispatch('mqtt:error', { message: this.lastConnectError, connected: Boolean(client.connected), transient: true });
      });

      client.on('close', () => {
        if (this.client !== client) return;
        APP_STATE.mqttConnected = false;
        this.connecting = true;
        this.updateDiagnostic('reconnecting', {
          reason: this.lastConnectError ? `broker/socket closed: ${this.lastConnectError}` : 'broker/socket closed',
          error: this.lastConnectError,
          origin: 'socket'
        });
        this.dispatch('mqtt:connected', false);
        this.dispatch('mqtt:reconnecting', { delay: 3000 });
      });

      return true;
    },

    disconnect(origin = 'ui') {
      this.clearReconnectTimer();
      this.connecting = false;
      window.clearInterval(this.deviceTimer);
      this.deviceTimer = null;
      if (this.client) {
        const client = this.client;
        this.client = null;
        try { client.end(true); } catch (_) {}
      }
      APP_STATE.mqttConnected = false;
      this.updateDiagnostic('disconnected', { reason: origin === 'ui' ? 'Dashboard/UI requested disconnect' : origin, origin });
      this.dispatch('mqtt:connected', false);
    },

    publish(topic, payload, options = {}) {
      if (!topic) return false;
      const requestId = this.nextPublishId();
      const opts = this.publishOptions(topic, options);
      const important = this.isImportantCommand(topic);

      if (!this.client?.connected) {
        if (!this.hasCredentials()) {
          this.dispatch('mqtt:credentials-required', { configured: false, forPublish: true });
          return false;
        }
        if (important) {
          this.dispatchCommandStatus('blocked', { requestId, topic, qos: opts.qos, reason: 'not-connected' });
          this.dispatch('mqtt:command-blocked', { topic, reason: 'not-connected' });
          this.connect();
          return false;
        }
        this.pendingPublishes.push({ requestId, topic, payload: String(payload), options: opts, createdAt: Date.now() });
        this.dispatchCommandStatus('queued', { requestId, topic, qos: opts.qos });
        this.connect();
        return true;
      }

      this.dispatchCommandStatus('pending', { requestId, topic, qos: opts.qos, important });
      return this.publishDirect(topic, String(payload), opts, requestId);
    },

    handleMessage(topic, payload) {
      const value = String(payload).trim();

      if (topic.startsWith('smartfarm/relay/') && topic.endsWith('/status')) {
        const relay = topic.split('/')[2];
        const on = value.toUpperCase() === 'ON';
        if (RELAYS.includes(relay) && (value.toUpperCase() === 'ON' || value.toUpperCase() === 'OFF')) {
          APP_STATE.relays[relay] = on;
          this.dispatch('relay:status', { relay, status: on });
        }
        return;
      }

      if (topic.startsWith('smartfarm/relay/') && topic.endsWith('/timer/status')) {
        const relay = topic.split('/')[2];
        if (!RELAYS.includes(relay)) return;
        try { this.dispatch('relay:timer-status', { relay, timer: JSON.parse(value) }); }
        catch (_) { this.dispatch('relay:timer-status', { relay, timer: { active: false, invalid: true } }); }
        return;
      }

      if (topic === this.config.topics.online) {
        // Firmware publishes this retained. It is only broker presence, not a fresh heartbeat.
        if (['false', 'offline', '0', 'no'].includes(value.toLowerCase())) this.setDeviceOnline(false, 'last-will');
        return;
      }

      if (topic === this.config.topics.deviceStatus) {
        try {
          const device = JSON.parse(value);
          if (device.online === false) {
            this.setDeviceOnline(false, 'device-status');
            return;
          }
          const uptime = Number(device.uptimeSec ?? device.uptime);
          if (Number.isFinite(uptime)) {
            if (this.lastHeartbeatUptime !== null && uptime !== this.lastHeartbeatUptime) {
              this.heartbeatSeenCount++;
              this.lastHeartbeatUptime = uptime;
              this.markDeviceSeen('heartbeat');
            } else if (this.lastHeartbeatUptime === null) {
              // First retained heartbeat is not trusted as fresh. The next 10s heartbeat must change uptime.
              this.lastHeartbeatUptime = uptime;
              this.heartbeatSeenCount = 0;
            }
          } else {
            this.heartbeatSeenCount++;
            this.markDeviceSeen('heartbeat');
          }
          this.dispatch('device:data', device);
        } catch (_) {}
        return;
      }

      if (topic === this.config.topics.modeStatus) {
        const mode = value.toUpperCase();
        if (mode === 'AUTO' || mode === 'MANUAL') this.dispatch('mode:status', mode);
        return;
      }

      if (topic === this.config.topics.time) {
        try { this.dispatch('time:data', JSON.parse(value)); } catch (_) {}
        return;
      }

      if (topic === this.config.topics.error) {
        try { this.dispatch('system:error', JSON.parse(value)); }
        catch (_) { this.dispatch('system:error', { code: 'INVALID_JSON', message: value }); }
        return;
      }

      if (topic === this.config.topics.emergencyStatus) {
        try {
          const emergency = JSON.parse(value);
          APP_STATE.emergencyLock = Boolean(emergency.active);
          this.dispatch('emergency:status', emergency);
        } catch (_) {
          this.dispatch('emergency:status', { active: Boolean(APP_STATE.emergencyLock), source: 'invalid-status' });
        }
        return;
      }

      if (topic === this.config.topics.telegramStatus) {
        try { this.dispatch('telegram:status', JSON.parse(value)); }
        catch (_) { this.dispatch('telegram:status', { configured: false }); }
        return;
      }

      if (topic.startsWith('smartfarm/schedule/') && topic.endsWith('/status')) {
        const relay = topic.split('/')[2];
        if (!RELAYS.includes(relay)) return;
        try { this.dispatch('schedule:status', { relay, schedule: JSON.parse(value) }); }
        catch (_) { this.dispatch('schedule:error', { relay, message: 'ข้อมูลตารางเวลาจากอุปกรณ์ไม่ถูกต้อง' }); }
        return;
      }

      if (topic === this.config.topics.aiAlertStatus) {
        try { this.dispatch('ai:alert-status', JSON.parse(value)); }
        catch (_) { this.dispatch('ai:alert-status', { status: 'invalid' }); }
        return;
      }

      if (topic === this.config.topics.reminderStatus) {
        try { this.dispatch('reminder:status', JSON.parse(value)); }
        catch (_) { this.dispatch('reminder:error', { message: 'ข้อมูล reminder จากอุปกรณ์ไม่ถูกต้อง' }); }
        return;
      }

      if (topic === this.config.topics.sensor('dht11')) {
        try {
          const sensor = JSON.parse(value);
          const numeric = input => input !== null && input !== '' && Number.isFinite(Number(input));
          if (numeric(sensor.temperature)) this.dispatch('sensor:data', { type: 'temperature', value: Number(sensor.temperature) });
          if (numeric(sensor.humidity)) this.dispatch('sensor:data', { type: 'humidity', value: Number(sensor.humidity) });
        } catch (_) {}
      }
    },

    bootstrap() {
      if (this.bootstrapped) return;
      this.bootstrapped = true;
      this.startDeviceWatchdog();
      if (this.hasCredentials()) this.connect();
      else this.dispatch('mqtt:credentials-required', { configured: false, initial: true, status: this.getCredentialStatus() });
    }
  };

  handler.config = window.MQTT_CONFIG;
  window.mqttHandler = handler;
  window.SmartFarmMqttConnection = handler;
})();