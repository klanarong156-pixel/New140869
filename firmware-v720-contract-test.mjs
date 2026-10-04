import fs from 'node:fs';
import assert from 'node:assert/strict';

const firmware = fs.readFileSync('SmartFarm_V7.2.1_OTA_ACCESS_FIX.ino', 'utf8');
const state = fs.readFileSync('dashboard/dashboard-state.js', 'utf8');
const dashboard = fs.readFileSync('dashboard/dashboard.js', 'utf8');
const html = fs.readFileSync('dashboard/index.html', 'utf8');
const controlRoomHtml = fs.readFileSync('control-room/index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const ini = fs.readFileSync('platformio.ini', 'utf8');
let passed = 0;
const check = (condition, label) => {
  assert.ok(condition, `FAIL: ${label}`);
  console.log(`PASS: ${label}`);
  passed++;
};
const bodyOf = (signature) => {
  const start = firmware.indexOf(signature);
  assert.notEqual(start, -1, `missing function ${signature}`);
  const open = firmware.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < firmware.length; i++) {
    if (firmware[i] === '{') depth++;
    if (firmware[i] === '}' && --depth === 0) return firmware.slice(open, i + 1);
  }
  throw new Error(`unclosed body for ${signature}`);
};

check(firmware.includes('#define SMARTFARM_VERSION "V7.2.1-OTA-ACCESS-FIX"'), 'firmware identity is V7.2.1-OTA-ACCESS-FIX');
check(ini.includes('platform = espressif8266@4.2.0') && ini.includes('board = nodemcuv2'), 'build pins ESP8266 Core 3.1.2 platform and NodeMCU target');
check(/#define RELAY_PUMP D5/.test(firmware) && /#define RELAY_ZONE1 D6/.test(firmware) && /#define RELAY_LIGHT_HOME D7/.test(firmware) && /#define RELAY_LIGHT_SALA D8/.test(firmware) && /#define DHT_PIN D2/.test(firmware), 'required relay and DHT11 pins remain unchanged');
check(firmware.includes('"SmartFarm-%06X"') && firmware.includes('ArduinoOTA.setHostname(otaHostname)') && firmware.includes('ArduinoOTA.setPort(OTA_ARDUINO_PORT)'), 'ArduinoOTA uses chip-derived hostname and configured port');
check(firmware.includes('ArduinoOTA.setPassword(otaPass)') && firmware.includes('if (otaPass[0])') && firmware.includes('ArduinoOTA.begin()'), 'ArduinoOTA starts only when a password exists');
check(['onStart', 'onProgress', 'onEnd', 'onError'].every(name => firmware.includes(`ArduinoOTA.${name}(`)), 'ArduinoOTA lifecycle callbacks are registered');
check(['OTA_AUTH_ERROR', 'OTA_BEGIN_ERROR', 'OTA_CONNECT_ERROR', 'OTA_RECEIVE_ERROR', 'OTA_END_ERROR'].every(name => firmware.includes(name)), 'OTA errors are logged with named error codes');
const safe = bodyOf('void enterOtaSafeState()');
check(safe.includes('mqtt.disconnect()') && safe.includes('tls.stop()') && safe.includes('telegramTls.stop()') && safe.includes('otaUpdateInProgress = true'), 'OTA safe state disconnects MQTT and both TLS clients before upload');
check(safe.includes('digitalWrite(relayPins[i], RELAY_OFF)') && safe.includes('pumpStartedAt = 0'), 'OTA safe state forces every relay off and clears pump runtime');
const recovery = bodyOf('void leaveOtaSafeState()');
check(recovery.includes('otaFailureLock = true') && recovery.includes('lastMqttAttempt = millis()'), 'failed OTA stays load-locked and delays MQTT reconnect');
check(bodyOf('void applyAutoState(uint16_t now)').includes('otaFailureLock'), 'automatic schedules cannot re-enable relays after OTA failure');
check(firmware.includes('otaServer.on("/", HTTP_GET') && /otaServer\.on\(\s*"\/update",\s*HTTP_POST/.test(firmware) && firmware.includes('otaServer.on("/api/status", HTTP_GET'), 'HTTP Web OTA page, upload and status routes exist');
check(firmware.includes('otaServer.authenticate("admin", otaPass)'), 'Web OTA routes enforce Basic Authentication');
check(firmware.includes('filename.endsWith(".bin")') && firmware.includes('filename.indexOf("..") < 0') && firmware.includes('otaUploadMaxBytes'), 'Web OTA validates extension, filename and maximum image size');
check(firmware.includes('ESP.getFreeSketchSpace()') && firmware.includes('Update.begin(otaUploadMaxBytes, U_FLASH)') && firmware.includes('Update.write(upload.buf, incoming)'), 'Web OTA bounds flash use and writes through ESP8266 Update API');
check(firmware.includes('Update.end(true)') && firmware.includes('Update.hasError()') && firmware.includes('otaHttpRestartPending'), 'Web OTA finalizes/verifies the image before delayed restart');
check(firmware.includes('Update.getError()') && firmware.includes('Update.getErrorString()') && firmware.includes('Update failed code='), 'HTTP OTA failure response exposes a numeric Update error code and reason');
const loop = bodyOf('void loop()');
check(loop.indexOf('otaHttpRestartPending') >= 0 && loop.indexOf('otaHttpRestartPending') < loop.indexOf('if (otaUpdateInProgress)'), 'HTTP OTA restart timer is serviced before the OTA early-return');
check(firmware.includes('x.upload.onprogress') && firmware.includes("$('status').textContent=s.otaStatus") && firmware.includes("$('heap').textContent=s.freeHeap"), 'Web OTA page renders device metrics, status and upload progress');
check(!firmware.includes('Access-Control-Allow-Origin') && firmware.includes('ห้าม Port Forward ไป Internet'), 'Web OTA avoids wildcard CORS and warns against Internet exposure');
check(firmware.includes('MQTT_RECONNECT_MAX_MS = 60000UL') && firmware.includes('mqttRetryDelayMs * 2'), 'MQTT reconnect uses capped exponential backoff');
const connectMqtt = bodyOf('void connectMqtt()');
check(!connectMqtt.includes('verifyMqttEndpoint()') && firmware.includes('mqtt.setSocketTimeout(5)'), 'MQTT retries avoid duplicate TLS preflight and use bounded socket timeout');
check(firmware.includes('MQTT_BASE "/status/device"') && firmware.includes('d["mode"] = autoMode') && firmware.includes('createNestedObject("relays")') && firmware.includes('d["otaStatus"]'), 'heartbeat includes device, mode, relay and OTA state');
check(firmware.includes('mqtt.publish(MQTT_BASE "/sensor/dht11"') && firmware.includes('isfinite') && !/if\s*\(isnan\(temperature\)\)[^\n]*25/.test(firmware), 'DHT11 publishes only real finite reads, with no fake fallback');
check(state.includes('value !== true && value !== false && value !== null') && state.includes('current.relays[relay] = value'), 'Dashboard preserves null relay state as unknown');
check(state.includes('value !== null && value !== undefined && value !==') && state.includes('sensor.temperature = validNumber(sensor.temperature)'), 'Dashboard does not coerce null DHT11 readings into zero');
check(dashboard.includes('state.esp.online !== true') && dashboard.includes('window.confirm'), 'relay and emergency commands require a recent online heartbeat and confirmation');
check(html.includes('data-esp-ota-status') && html.includes('data-esp-ota-progress') && !/Zone\s*2/i.test(html), 'Dashboard shows OTA diagnostics and does not expose Zone 2');
check(sw.includes('smartfarm-v53-unified-dashboard') && html.includes('dashboard.css?v=15') && html.includes('dashboard-state.js?v=5') && html.includes('dashboard-mqtt.js?v=4') && html.includes('dashboard.js?v=18') && html.includes('unified-auth.js?v=1') && html.includes('control-room-schedule.js?v=5') && controlRoomHtml.includes('../dashboard/?page=water') && sw.includes('dashboard/dashboard.css?v=15') && sw.includes('dashboard-state.js?v=5') && sw.includes('dashboard-mqtt.js?v=4') && sw.includes('dashboard.js?v=18') && sw.includes('dashboard/unified-auth.js?v=1') && sw.includes('control-room/control-room-schedule.js?v=5'), 'Service Worker and unified Dashboard assets/legacy redirects align');
console.log(`\n${passed} firmware/dashboard contract checks passed.`);
