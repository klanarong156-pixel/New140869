/* Shared MQTT connection for Smart Farm pages. It keeps one WebSocket per browser origin. */
importScripts('mqtt.min.js?v=1');

const ports = new Set();
let client = null;
let connecting = false;
let connectionConfig = null;
let connectionCredentials = null;

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
  if (force && client) {
    client.end(true);
    client = null;
    connecting = false;
  }
  connecting = true;
  broadcast({ type: 'connecting' });
  try {
    client = mqtt.connect(connectionConfig.url, {
      clientId: connectionConfig.clientId,
      username: connectionCredentials.username,
      password: connectionCredentials.password,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
      keepalive: 30
    });
  } catch (error) {
    connecting = false;
    broadcast({ type: 'error', error: errorMessage(error) });
    return false;
  }
  client.on('connect', () => {
    connecting = false;
    subscribeAll();
    broadcast({ type: 'connect' });
  });
  client.on('message', (topic, message) => {
    broadcast({ type: 'message', topic, payload: message.toString() });
  });
  client.on('close', () => {
    connecting = false;
    broadcast({ type: 'close' });
  });
  client.on('reconnect', () => {
    connecting = true;
    broadcast({ type: 'reconnect' });
  });
  client.on('error', error => broadcast({ type: 'error', error: errorMessage(error) }));
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
      if (client?.connected) send(port, { type: 'connect' });
      return;
    }
    if (message.type === 'publish') {
      if (client?.connected) client.publish(message.topic, String(message.payload ?? ''), message.options || {});
      else send(port, { type: 'publish-failed', topic: message.topic });
      return;
    }
    if (message.type === 'disconnect') {
      if (client) client.end(true);
      client = null;
      connecting = false;
      broadcast({ type: 'close' });
    }
  };
};
