import fs from 'node:fs';
import assert from 'node:assert/strict';

const fw = fs.readFileSync(new URL('./SmartFarm_V7.4.0_WDT_DIAGNOSTICS.ino', import.meta.url), 'utf8');
let passed = 0;
function check(ok, label) {
  assert.ok(ok, `FAIL: ${label}`);
  console.log(`PASS: ${label}`);
  passed++;
}
function sliceBetween(text, start, end) {
  const a = text.indexOf(start);
  assert.notEqual(a, -1, `missing anchor: ${start}`);
  const b = text.indexOf(end, a + start.length);
  assert.notEqual(b, -1, `missing end anchor: ${end}`);
  return text.slice(a, b);
}

const mqtt = sliceBetween(fw, 'void connectMqtt() {', '\nvoid ');
const loop = sliceBetween(fw, 'void loop() {', '\n}');
const sensor = sliceBetween(loop, 'if ((uint32_t)(millis() - lastSensor)', 'if ((uint32_t)(millis() - lastHeartbeat)');
const queue = sliceBetween(fw, 'void processTelegramQueue(', '\nvoid reportWifiState()');
const setup = sliceBetween(fw, 'void setup() {', '\nvoid ');

check(setup.includes('BOOT: reset_reason=') && setup.includes('BOOT: reset_info='),
  'startup emits explicit reset reason and reset information');
check(fw.includes('Serial.println(ESP.getResetReason())') && fw.includes('Serial.println(ESP.getResetInfo())'),
  'reset diagnostics use ESP8266 core reset APIs');
check(mqtt.indexOf('now - lastMqttAttempt') < mqtt.indexOf('prepareTlsValidationTime()'),
  'MQTT retry backoff gates TLS clock work');
check(mqtt.includes('now - lastMqttClockCheck') && mqtt.includes('MQTT_CLOCK_CHECK_INTERVAL_MS'),
  'clock-invalid state is polled at a bounded interval');
check(mqtt.includes('mqttRetryDelayMs * 2') && mqtt.includes('MQTT_RECONNECT_MAX_MS'),
  'failed MQTT reconnect uses capped exponential backoff');
check(fw.includes('WiFi.reconnect()') && fw.includes('WIFI_RECONNECT_INTERVAL_MS'),
  'Wi-Fi recovery requests are rate limited');

check(sensor.includes('sensorValid = isfinite(h) && isfinite(c)'),
  'DHT11 invalid reads are explicitly rejected');
check(sensor.includes('sensorJustBecameUnavailable') && sensor.includes('SENSOR_DIAGNOSTIC_INTERVAL_MS'),
  'absent-sensor diagnostics are transition-based and rate limited');
check(!sensor.includes('queueTelegram('),
  'missing DHT11 does not enqueue repeat Telegram alerts');
check(sensor.includes('if (mqtt.connected() && sensorValid)') &&
      sensor.includes('d["temperature"] = c') && sensor.includes('d["humidity"] = h'),
  'only finite real DHT11 readings can be published');
check(fw.includes('d["sensorAvailable"] = sensorAvailable'),
  'dashboard heartbeat reports sensor availability without inventing readings');

check(loop.indexOf('runSafety();') < loop.indexOf('connectMqtt();') &&
      loop.indexOf('runSchedules();') < loop.indexOf('connectMqtt();') &&
      loop.indexOf('runReminders();') < loop.indexOf('connectMqtt();'),
  'safety, relay schedules, and timers run before blocking network work');
check(queue.includes('deferForMqttHandshake ||') &&
      loop.includes('processTelegramQueue(mqttConnectAttempts != mqttAttemptsAtLoopStart)'),
  'Telegram send is deferred when an MQTT handshake was attempted in the same loop');
check(fw.includes('TELEGRAM_HTTP_TIMEOUT_MS = 1500U') &&
      fw.includes('TELEGRAM_RETRY_COOLDOWN_MS = 15000UL') &&
      fw.includes('TELEGRAM_MAX_ATTEMPTS = 2'),
  'Telegram HTTP timeout, cooldown, and retry count are bounded');
check(queue.includes('++item.attempts >= TELEGRAM_MAX_ATTEMPTS'),
  'Telegram queue removes a failed item only after its bounded retries');
check(loop.includes('ESP.wdtFeed()') && loop.includes('yield();'),
  'main loop continues feeding/yielding to the ESP8266 watchdog');

for (const token of [
  '#define RELAY_PUMP D5', '#define RELAY_ZONE1 D6',
  '#define RELAY_LIGHT_HOME D7', '#define RELAY_LIGHT_SALA D8',
  'void engageEmergencyStop(', 'void resetEmergencyStop(',
  'void runSchedules()', 'ArduinoOTA.begin()', 'otaServer.begin(OTA_HTTP_PORT)',
  'mqttCallback', 'mqtt.publish(',
]) check(fw.includes(token), `existing control capability retained: ${token}`);

console.log(`\n${passed} firmware resilience contract checks passed.`);
