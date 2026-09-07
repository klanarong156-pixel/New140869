const MQTT_BROKER = Object.freeze({
  protocol: 'wss:',
  host: '650188a0e2b4367b7c131fb385590a9.s1.eu.hivemq.cloud',
  port: 8884,
  path: '/mqtt'
});

const MQTT_ALLOWED_BROKER_HOSTS = Object.freeze([
  '650188a0e2b4367b7c131fb385590a9.s1.eu.hivemq.cloud'
]);

function buildMqttBrokerUrl(broker) {
  if (broker.protocol !== 'wss:' || broker.port !== 8884 || broker.path !== '/mqtt') {
    throw new Error('MQTT broker must use HiveMQ WSS on port 8884 and path /mqtt');
  }
  if (!MQTT_ALLOWED_BROKER_HOSTS.includes(broker.host)) {
    throw new Error('MQTT broker host is not allowlisted');
  }
  return `${broker.protocol}//${broker.host}:${broker.port}${broker.path}`;
}

const MQTT_CONFIG = Object.freeze({
  broker: MQTT_BROKER,
  url: buildMqttBrokerUrl(MQTT_BROKER),
  credentialSource: 'browser-storage',
  clientId: `SmartFarmWeb-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`,
  topics: Object.freeze({
    relaySet: relay => `smartfarm/relay/${relay}/set`,
    relayStatus: relay => `smartfarm/relay/${relay}/status`,
    relayTimerSet: relay => `smartfarm/relay/${relay}/timer/set`,
    relayTimerStatus: relay => `smartfarm/relay/${relay}/timer/status`,
    sensor: sensor => `smartfarm/sensor/${sensor}`,
    scheduleSet: relay => `smartfarm/schedule/${relay}/set`,
    scheduleStatus: relay => `smartfarm/schedule/${relay}/status`,
    online: 'smartfarm/status/online',
    deviceStatus: 'smartfarm/device/status',
    telegramSet: 'smartfarm/config/telegram/set',
    telegramTest: 'smartfarm/config/telegram/test',
    telegramStatus: 'smartfarm/config/telegram/status',
    reminderSet: 'smartfarm/reminder/set',
    reminderStatus: 'smartfarm/reminder/status',
    aiAlertSet: 'smartfarm/ai/alert/set',
    aiAlertStatus: 'smartfarm/ai/alert/status',
    emergencySet: 'smartfarm/emergency/set',
    emergencyStatus: 'smartfarm/emergency/status'
  }),
  allowedSubscribeTopics: Object.freeze([
    'smartfarm/relay/+/status',
    'smartfarm/relay/+/timer/status',
    'smartfarm/sensor/dht11',
    'smartfarm/status/online',
    'smartfarm/device/status',
    'smartfarm/config/telegram/status',
    'smartfarm/schedule/+/status',
    'smartfarm/reminder/status',
    'smartfarm/ai/alert/status',
    'smartfarm/emergency/status'
  ]),
  deviceHeartbeatTimeoutMs: 25000
});

const HARDWARE_PINS = Object.freeze({
  DHT11_DATA: 'D2 / GPIO4',
  RTC_SDA: 'D3 / GPIO0',
  RTC_SCL: 'D4 / GPIO2',
  PUMP: 'D5 / GPIO14',
  ZONE1: 'D6 / GPIO12',
  HOME_LIGHT: 'D7 / GPIO13',
  SALA_LIGHT: 'D8 / GPIO15',
  SOIL_SENSOR: 'A0 / ADC0'
});

const RELAYS = Object.freeze(['pump', 'zone1', 'lighthome', 'lightsala']);
const RELAY_NAMES = Object.freeze({
  pump: 'ปั๊มน้ำ',
  zone1: 'โซน 1',
  lighthome: 'ไฟบ้าน',
  lightsala: 'ไฟศาลา'
});
const APP_STATE = {
  mqttConnected: false,
  espOnline: false,
  espLastSeen: 0,
  espStatusSource: 'none',
  relays: { pump: false, zone1: false, lighthome: false, lightsala: false },
  emergencyLock: false
};

window.MQTT_CONFIG = MQTT_CONFIG;
window.HARDWARE_PINS = HARDWARE_PINS;
window.RELAYS = RELAYS;
window.RELAY_NAMES = RELAY_NAMES;
window.APP_STATE = APP_STATE;
