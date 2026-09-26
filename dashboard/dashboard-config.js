(() => {
  'use strict';

  const broker = Object.freeze({
    protocol: 'wss:',
    host: '25305924f68c41f2a1e089a1836d3287.s1.eu.hivemq.cloud',
    port: 8884,
    path: '/mqtt'
  });

  const relays = Object.freeze([
    { id: 'pump', name: 'ปั๊มน้ำ', pin: 'D5 / GPIO14', icon: '💧' },
    { id: 'zone1', name: 'โซน 1', pin: 'D6 / GPIO12', icon: '🌿' },
    { id: 'lighthome', name: 'ไฟบ้าน', pin: 'D7 / GPIO13', icon: '⌂' },
    { id: 'lightsala', name: 'ไฟศาลา', pin: 'D8 / GPIO15', icon: '✦' }
  ]);

  const topics = Object.freeze({
    online: 'smartfarm/status/online',
    device: 'smartfarm/status/device',
    dht11: 'smartfarm/sensor/dht11',
    relayStatus: relay => `smartfarm/relay/${relay}/status`,
    relaySet: relay => `smartfarm/relay/${relay}/set`,
    modeStatus: 'smartfarm/mode/status',
    modeSet: 'smartfarm/mode/set',
    scheduleStatus: 'smartfarm/schedule/+/status',
    scheduleSet: relay => `smartfarm/schedule/${relay}/set`,
    telegramSet: 'smartfarm/config/telegram/set',
    telegramTest: 'smartfarm/config/telegram/test',
    telegramStatus: 'smartfarm/config/telegram/status',
    reminderSet: 'smartfarm/reminder/set',
    reminderStatus: 'smartfarm/reminder/status',
    aiAlertSet: 'smartfarm/ai/alert/set',
    aiAlertStatus: 'smartfarm/ai/alert/status',
    emergencySet: 'smartfarm/emergency/set',
    emergencyStatus: 'smartfarm/emergency/status',
    time: 'smartfarm/time',
    error: 'smartfarm/system/error'
  });

  const mqttConfig = Object.freeze({
    broker,
    url: `${broker.protocol}//${broker.host}:${broker.port}${broker.path}`,
    defaultUsername: 'smartfarm',
    storageUsername: 'smartfarm.dashboard.username',
    storagePassword: 'smartfarm.dashboard.password',
    heartbeatTimeoutMs: 25000,
    allowedSubscribeTopics: Object.freeze([
      'smartfarm/status/online',
      'smartfarm/status/device',
      'smartfarm/sensor/dht11',
      'smartfarm/relay/+/status',
      'smartfarm/mode/status',
      'smartfarm/schedule/+/status',
      'smartfarm/config/telegram/status',
      'smartfarm/reminder/status',
      'smartfarm/ai/alert/status',
      'smartfarm/emergency/status',
      'smartfarm/time',
      'smartfarm/system/error'
    ])
  });

  window.SmartFarmDashboardConfig = Object.freeze({
    mqtt: mqttConfig,
    topics,
    relays,
    hardware: Object.freeze({
      board: 'ESP8266 NodeMCU',
      dht11: 'D2 / GPIO4',
      rtc: 'SDA D3 / GPIO0 · SCL D4 / GPIO2',
      relayLogic: 'Active LOW',
      soil: 'ไม่ได้ติดตั้ง'
    }),
    weather: Object.freeze({
      latitude: 7.798754,
      longitude: 99.990505,
      timezone: 'Asia/Bangkok'
    })
  });
})();
