/* Shared MQTT connection for Smart Farm pages. It keeps one WebSocket per browser origin. */
importScripts('mqtt.min.js?v=1');

const ports = new Set();
let client = null;
let connecting = false;
let connectionConfig = null;
let connectionCredentials = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let lastDeviceStatus = null;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

function send(port, message) {
  try { port.postMessage(message); } catch (_) { /* A navigated page may have closed its port. */ }
}

function broadcast(message) {
  ports.forEach(port => send(port, message));
}

function errorMessage(error) {
  return String(error?.message || error || 'MQTT worker error');
}

function subscribeAll() {
  if (!client?.connected || !connectionConfig?.allowedSubscribeTopics) return;
  connectionConfig.allowedSubscribeTopics.forEach(topic => {
    client.subscribe(topic, { qos: 0 }, error => {
      if (error) broadcast({ type: 'subscribe-error', topic, error: errorMessage(error) });
    });
  });
}

function scheduleReconnect() {
  if (reconnectTimer || !connectionConfig || !connectionCredentials?.username || !connectionCredentials?.password)
    return;
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * (2 ** Math.min(reconnectAttempt, 5)));
  reconnectAttempt++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect(false);
  }, delay);
  broadcast({ type: 'reconnect-scheduled', delay });
}

function clearReconnectTimer() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function connect(force = false) {
  if (typeof mqtt === 'undefined') {
    broadcast({ type: 'error', error: 'ไม่พบ MQTT library ใน SharedWorker' });
    return false;
  }
  if (!connectionConfig || !connectionCredentials?.username || !connectionCredentials?.password) {
    broadcast({ type: 'credentials-required' });
    return false;
  }
  if (!force && (client?.connected || connecting)) return true;
  clearReconnectTimer();
  if (force && client) {
    const oldClient = client;
    client = null;
    oldClient.end(true);
    connecting = false;
  }
  connecting = true;
  broadcast({ type: 'connecting' });
  let nextClient;
  try {
    nextClient = mqtt.connect(connectionConfig.url, {
      clientId: connectionConfig.clientId,
      username: connectionCredentials.username,
      password: connectionCredentials.password,
      clean: true,
      // The worker owns backoff so pages never start competing reconnect loops.
      reconnectPeriod: 0,
      connectTimeout: 30000,
      keepalive: 30
    });
    client = nextClient;
  } catch (error) {
    connecting = false;
    broadcast({ type: 'error', error: errorMessage(error) });
    scheduleReconnect();
    return false;
  }
  nextClient.on('connect', () => {
    if (client !== nextClient) return;
    connecting = false;
    reconnectAttempt = 0;
    clearReconnectTimer();
    subscribeAll();
    broadcast({ type: 'connect' });
  });
  nextClient.on('message', (topic, message) => {
    if (client !== nextClient) return;
    const payload = message.toString();
    if (topic === 'smartfarm/device/status') lastDeviceStatus = payload;
    broadcast({ type: 'message', topic, payload });
  });
  nextClient.on('close', () => {
    if (client !== nextClient) return;
    client = null;
    connecting = false;
    broadcast({ type: 'close' });
    scheduleReconnect();
  });
  nextClient.on('reconnect', () => {
    if (client !== nextClient) return;
    connecting = true;
    broadcast({ type: 'reconnect' });
  });
  nextClient.on('error', error => {
    if (client === nextClient) broadcast({ type: 'error', error: errorMessage(error) });
  });
  return true;
}

self.onconnect = event => {
  const port = event.ports[0];
  ports.add(port);
  port.start();
  port.onmessage = messageEvent => {
    const message = messageEvent.data || {};
    if (message.type === 'connect') {
      connectionConfig = message.config || connectionConfig;
      connectionCredentials = message.credentials || connectionCredentials;
      connect(Boolean(message.force));
      if (lastDeviceStatus) send(port, { type: 'message', topic: 'smartfarm/device/status', payload: lastDeviceStatus });
      if (client?.connected) send(port, { type: 'connect' });
      return;
    }
    if (message.type === 'publish') {
      if (client?.connected) client.publish(message.topic, String(message.payload ?? ''), message.options || {});
      else send(port, { type: 'publish-failed', topic: message.topic });
      return;
    }
    if (message.type === 'disconnect') {
      clearReconnectTimer();
      reconnectAttempt = 0;
      if (client) client.end(true);
      client = null;
      connecting = false;
      broadcast({ type: 'close' });
    }
  };
};
