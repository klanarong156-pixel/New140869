import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = [
  'config.js',
  'mqtt-handler.js',
  'app.js',
  'schedule.js',
  'telegram-settings.js',
  'crop-reminders.js',
  'crop-plots.js',
  'farm-analytics.js',
  'ai-farm-advisor.js',
  'farm-tools.js',
  'farm-clock.js',
  'mqtt-shared-worker.js',
  'user-management.js',
  'weather.js',
  'auto-weather-guard.js',
  'dashboard-ota.js',
  'admin.js',
  'finance.js',
  'functions/index.js',
];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`SYNTAX FAIL: ${file}\n${result.stderr}`);
    process.exit(1);
  }
}

const read = file => fs.readFileSync(file, 'utf8');
const cfg = read('config.js');
const handler = read('mqtt-handler.js');
const app = read('app.js');
const schedule = read('schedule.js');
const telegram = read('telegram-settings.js');
const reminders = read('crop-reminders.js');
const plots = read('crop-plots.js');
const analytics = read('farm-analytics.js');
const aiAdvisor = read('ai-farm-advisor.js');
const tools = read('farm-tools.js');
const clock = read('farm-clock.js');
const worker = read('mqtt-shared-worker.js');
const weather = read('weather.js');
const guard = read('auto-weather-guard.js');
const ota = read('dashboard-ota.js');
const standaloneOta = read('ota-standalone.html');
const index = read('index.html');
const schedulePage = read('schedule.html');
const settings = read('settings.html');
const firmware = read('SmartFarm_V6_PRODUCTION.ino');
const sw = read('sw.js');
const readme = read('README.txt');
const boardReference = read('BOARD_REFERENCE.md');
const buildStatus = read('BUILD_STATUS.txt');
const mqttContract = read('MQTT_CONTRACT_V6.md');
const mqttContractHtml = read('MQTT_CONTRACT_V6.html');
const rules = read('firebase.rules.json');
const databaseRules = read('database.rules.json');
const functions = read('functions/index.js');
const activeJs = files.map(read).join('\\n');

const checks = [
  ['HiveMQ WSS endpoint is configured', /wss:\/\/[^"']+:8884\/mqtt/.test(cfg)],
  ['All four relay IDs exist', /pump.*zone1.*lighthome.*lightsala/s.test(cfg)],
  ['Relay set topic exists', /relaySet:.*smartfarm\/relay/.test(cfg)],
  ['Relay timer topic exists', /relayTimerSet: relay =>/.test(cfg)],
  ['Sensor topic factory exists', /sensor: sensor =>/.test(cfg)],
  ['Online topic exists', /online: 'smartfarm\/status\/online'/.test(cfg)],
  ['Device status topic exists', /deviceStatus: 'smartfarm\/device\/status'/.test(cfg)],
  ['Schedule topic factory exists', /scheduleSet: relay =>/.test(cfg)],
  ['Telegram topics exist', /telegramSet: 'smartfarm\/config\/telegram\/set'/.test(cfg) && /telegramTest: 'smartfarm\/config\/telegram\/test'/.test(cfg)],
  ['Reminder topics exist', /reminderSet: 'smartfarm\/reminder\/set'/.test(cfg) && /reminderStatus: 'smartfarm\/reminder\/status'/.test(cfg)],
  ['AI alert topic is isolated from relay commands', /aiAlertSet: 'smartfarm\/ai\/alert\/set'/.test(cfg) && /aiAlertStatus: 'smartfarm\/ai\/alert\/status'/.test(cfg) && /ai\/alert\/set/.test(firmware) && /handleAiAlert/.test(firmware)],
  ['Browser uses current MQTT handler', /new MqttHandler\(MQTT_CONFIG\)/.test(handler)],
  ['SharedWorker keeps one MQTT connection across pages', /new SharedWorker/.test(handler) && /mqtt-shared-worker\.js/.test(handler) && /importScripts\('mqtt\.min\.js/.test(worker)],
  ['SharedWorker owns bounded reconnect backoff', /RECONNECT_BASE_MS/.test(worker) && /RECONNECT_MAX_MS/.test(worker) && /reconnectPeriod: 0/.test(worker) && /scheduleReconnect/.test(worker)],
  ['SharedWorker replays latest device heartbeat', /lastDeviceStatus/.test(worker) && /smartfarm\/device\/status/.test(worker) && /type: 'message'/.test(worker)],
  ['SharedWorker replays latest schedule status', /lastScheduleStatuses/.test(worker) && /smartfarm\/schedule\//.test(worker) && /forEach\(\(payload, topic\)/.test(worker)],
  ['Current app binds relay controls', /\[data-relay-toggle\]/.test(app)],
  ['Unlimited timer command is supported', /seconds === 'UNLIMITED'/.test(app) && /UNLIMITED/.test(firmware)],
  ['Schedule payload uses slots/on/off schema', /return \{ slots: data \}/.test(schedule) && /JSON\.stringify\(payload\)/.test(schedule)],
  ['Schedule delete uses DELETE command', /scheduleSet\(activeRelay\), 'DELETE'/.test(schedule)],
  ['Telegram payload uses botToken/chatId', /botToken/.test(telegram) && /chatId/.test(telegram)],
  ['Telegram commands are non-retained', /retain: false/.test(telegram)],
  ['Reminder UI stores tasks and sends settings', /cropReminders/.test(reminders) && /reminderSet/.test(reminders) && /farm\/cropReminders/.test(reminders)],
  ['Reminder supports plots, recurrence and quiet-hour payload', /plotId/.test(reminders) && /repeatEveryDays/.test(reminders) && /quietStartHour/.test(reminders) && /quietEndHour/.test(reminders)],
  ['Schedule page contains reminder management UI', /id="crop-reminders"/.test(schedulePage) && /reminderSettingsForm/.test(schedulePage) && /reminderForm/.test(schedulePage)],
  ['Dashboard rejects overlapping schedule slots', /slotsOverlap/.test(schedule) && /ชนกับช่วงที่/.test(schedule) && /scheduleValidation/.test(schedulePage)],
  ['Multiple plot model is bounded and persisted', /MAX_PLOTS = 8/.test(plots) && /farm\/cropPlots/.test(plots) && /textContent/.test(plots)],
  ['Analytics stores real sensor history and renders chart', /sensor:data/.test(analytics) && /sensorHistoryChart/.test(analytics) && /getContext\('2d'\)/.test(analytics) && !/Math\.random/.test(analytics)],
  ['AI advisor uses real events, persists history and has no relay publisher', /sensor:data/.test(aiAdvisor) && /weather:protection/.test(aiAdvisor) && /farm\/aiAdvisor/.test(aiAdvisor) && /aiAlertSet/.test(aiAdvisor) && !/relaySet|relayTimerSet/.test(aiAdvisor)],
  ['AI advisor limits duplicate notifications and keeps safety read-only', /AUTO_COOLDOWN_MS/.test(aiAdvisor) && /payload.length > 900/.test(aiAdvisor) && /ไม่สั่งรีเลย์/.test(aiAdvisor)],
  ['Homepage clock uses RTC heartbeat time directly', /device:data/.test(clock) && /device\.time/.test(clock) && /rtc/.test(clock) && /data-farm-time/.test(index) && /data-farm-clock-source/.test(index)],
  ['Backup excludes secrets and supports restore', /SECRET_KEY/.test(tools) && /downloadJson/.test(tools) && /FirebaseDB\.put/.test(tools)],
  ['Firmware uses same broker and base topic', /#define MQTT_SERVER/.test(firmware) && /#define MQTT_BASE "smartfarm"/.test(firmware)],
  ['Firmware recovers Wi-Fi and clears stale MQTT socket', /WIFI_RECONNECT_INTERVAL_MS/.test(firmware) && /void maintainWifi\(\)/.test(firmware) && /WiFi\.reconnect\(\)/.test(firmware) && /tls\.stop\(\)/.test(firmware)],
  ['Firmware subscribes to relay/timer/schedule topics', /relay\/\+\/set/.test(firmware) && /timer\/set/.test(firmware) && /schedule\/\+\/set/.test(firmware)],
  ['Firmware accepts Telegram topics', /config\/telegram\/set/.test(firmware) && /config\/telegram\/test/.test(firmware)],
  ['Firmware accepts reminder topic and persists reminders', /reminder\/set/.test(firmware) && /smartfarm_reminders\.json/.test(firmware) && /runReminders/.test(firmware)],
  ['Firmware validates and rate-limits AI Telegram alerts', /validAiSeverity/.test(firmware) && /strlen\(text\) > 420/.test(firmware) && /duplicate/.test(firmware) && /rate_limited/.test(firmware) && /ai\/alert\/set/.test(firmware)],
  ['Firmware deduplicates sent reminders', /lastSentDate/.test(firmware) && /send_failed/.test(firmware)],
  ['Firmware validates every RTC read', /bool validRtcDateTime/.test(firmware) && /DateTime candidate = rtc\.now\(\)/.test(firmware) && /readRtcNow/.test(firmware)],
  ['Firmware verifies RTC read-back after NTP adjust', /rtc\.adjust\(DateTime\(localEpoch\)\)/.test(firmware) && /readBackOk/.test(firmware) && /delta <= 2UL/.test(firmware)],
  ['Firmware OTA uses max sketch space and PNA CORS', /maxSketchSpace/.test(firmware) && /Update\.begin\(maxSketchSpace, U_FLASH\)/.test(firmware) && /Access-Control-Allow-Private-Network/.test(firmware)],
  ['Firmware OTA finalizes before delayed reboot', /otaUploadCompleted/.test(firmware) && /Update\.end\(true\)/.test(firmware) && /Connection", "close"/.test(firmware) && /otaHttpRestartAt = millis\(\) \+ 1500UL/.test(firmware)],
  ['Firmware OTA frees MQTT/TLS before upload stream', /mqtt\.disconnect\(\);/.test(firmware) && /tls\.stop\(\);/.test(firmware) && /OTA HTTP: START/.test(firmware)],
  ['Firmware OTA rejects truncated upload before reboot', /completeSize/.test(firmware) && /upload\.totalSize == otaUploadBytes/.test(firmware) && /SIZE MISMATCH/.test(firmware)],
  ['Firmware OTA forces relays OFF and pauses schedules', /enterOtaSafeState/.test(firmware) && /otaUpdateInProgress/.test(firmware) && /if \(otaUpdateInProgress\) return/.test(firmware)],
  ['Firmware does not impose a pump 30-minute or MQTT-loss cutoff', /ไม่มีเพดานเวลาทำงานแบบ 30 นาที/.test(firmware) && /การหลุด MQTT ต้องไม่ตัด/.test(firmware) && !/60-second.*MQTT-loss/.test(firmware)],
  ['Firmware queues event Telegram notifications', /telegramQueue/.test(firmware) && /processTelegramQueue/.test(firmware) && /lastTelegramAttempt/.test(firmware)],
  ['Firmware heartbeat includes field diagnostics', /heapMaxBlock/.test(firmware) && /heapFrag/.test(firmware) && /sensorFaults/.test(firmware) && /pumpRuntimeSec/.test(firmware) && /resetReason/.test(firmware)],
  ['Firmware retains latest RTC heartbeat', /device\/status/.test(firmware) && /mqtt\.publish\(MQTT_BASE "\/device\/status", out, true\)/.test(firmware)],
  ['Dashboard renders field diagnostics', /systemSensorDetail/.test(analytics) && /systemPumpDetail/.test(analytics) && /systemReconnectDetail/.test(analytics) && /farm-analytics\.js\?v=3/.test(index)],
  ['Dashboard has realtime MQTT status panel', /data-mqtt-live-panel/.test(index) && /data-mqtt-live-label/.test(index) && /data-mqtt-device-status/.test(index) && /data-mqtt-last-update/.test(index) && /setText\('mqttLiveLabel'/.test(app) && /mqtt:reconnecting/.test(app)],
  ['User Management page is Admin-only', /data-admin-required=\"true\"/.test(read('admin.html')) && /user-management\.js/.test(read('admin.html')) && /window\.addEventListener\('access:ready'/.test(read('user-management.js'))],
  ['User Management backend has protected Auth actions', /exports\.listUsers/.test(functions) && /exports\.setUserRole/.test(functions) && /exports\.setUserDisabled/.test(functions) && /exports\.createPasswordResetLink/.test(functions) && /exports\.deleteUser/.test(functions) && /requireAdmin/.test(functions)],
  ['Dashboard distinguishes MQTT stop from physical E-stop', /ไม่ใช่อุปกรณ์ตัดไฟฉุกเฉินทางกายภาพ/.test(index) && /E-stop/.test(schedulePage)],
  ['Documentation matches no pump hard cutoff policy', /ไม่มี hard cutoff 30 นาที/.test(readme) && /no forced 30-minute.*cutoff/.test(mqttContract) && /No 30-minute pump ceiling/.test(buildStatus) && /no forced 30-minute.*cutoff/.test(mqttContractHtml)],
  ['Firmware schedule parser accepts slots/on/off', /d\["slots"\]/.test(firmware) && /o\["on"\]/.test(firmware) && /o\["off"\]/.test(firmware)],
  ['Firmware schedule persistence checks write result and restores previous data', /bool saveConfig\(\)/.test(firmware) && /serializeJson\(d, f\)/.test(firmware) && /d\.overflowed\(\)/.test(firmware) && /persistence failed/.test(firmware) && /previous\[s\]/.test(firmware)],
  ['Firmware secrets persistence checks write result and restores Telegram config', /bool saveSecrets\(\)/.test(firmware) && /return bytes > 0/.test(firmware) && /Credential persistence failed/.test(firmware) && /previousToken/.test(firmware)],
  ['Firmware MQTT control logs use real newlines', /MQTT RX: topic=%s payload=%s\\n/.test(firmware) && !/MQTT RX: topic=%s payload=%s\\\\n/.test(firmware)],
  ['Firmware rejects overlapping or malformed schedule slots', /schedulesOverlap/.test(firmware) && /scheduleSetValid/.test(firmware) && /invalid time/.test(firmware) && /reason=/.test(firmware) && /malformed/.test(firmware) && /slot-count/.test(firmware)],
  ['Firmware schedules use RTC with validated NTP fallback', /scheduleClockMinutes/.test(firmware) && /ntp\.getEpochTime\(\) < 1704067200UL/.test(firmware) && /applyAutoState\(scheduleMinutes\)/.test(firmware)],
  ['Relay writes only on state changes', /if \(wasOn == on\)\s*return/.test(firmware)],
  ['Timer loop ignores relays without finite timers', /if \(!relayTimerUntil\[i\]\) continue/.test(firmware) && /runRelayTimers/.test(firmware)],
  ['Timer expiry resolves against RTC schedule before OFF', /scheduleKeepsOn/.test(firmware) && /readRtcNow\(timerNow\)/.test(firmware) && /if \(!scheduleKeepsOn\) relaySetRaw\(i, false\)/.test(firmware)],
  ['Dashboard validates time ranges and guards duplicate schedule publishes', /SCHEDULE_PUBLISH_GUARD_MS = 8000/.test(schedule) && /pendingSchedule/.test(schedule) && /timeToMinutes\(slot\.on\) < 0/.test(schedule) && /กำลังบันทึกตาราง/.test(schedule)],
  ['Usage estimator lives in settings, not dashboard', !/id="usagePanel"/.test(index) && /id="usagePanel"/.test(settings) && /usagePumpMinutes/.test(settings) && /usageWaterLiters/.test(settings) && /usageEnergyKwh/.test(settings) && /usageElectricCost/.test(settings)],
  ['Usage estimator persists configurable flow power and tariff', /USAGE_KEY/.test(analytics) && /localStorage\.setItem\(USAGE_KEY/.test(analytics) && /usageTotals/.test(analytics) && /pumpPower/.test(analytics) && /tariff/.test(analytics)],
  ['Usage reset starts current total at zero without deleting history', /usage\.resetAt/.test(analytics) && /effectiveFrom/.test(analytics) && /ยอดปัจจุบันเริ่มหลังรีเซ็ต/.test(analytics)],
  ['Dashboard pages load current app.js', /app\.js\?v=/.test(index) && /app\.js\?v=/.test(schedulePage) && /app\.js\?v=/.test(settings)],
  ['Board reference matches firmware and settings link', /SmartFarm_V6\.0|V7\.1\.0-FIELD-STABILITY/.test(boardReference) && /DHT11_DATA|DHT11 data/.test(boardReference) && /RELAY_PUMP|ปั้มน้ำ/.test(boardReference) && /BOARD_REFERENCE\.md/.test(settings)],
  ['All user pages use compact UI mode', /compact-ui/.test(index) && /compact-ui/.test(schedulePage) && /compact-ui/.test(settings) && /compact-ui/.test(read('finance.html')) && /compact-ui/.test(read('account.html')) && /compact-ui/.test(read('admin.html')) && /compact-ui/.test(read('ota.html'))],
  ['Schedule page uses short labels and one save action', /<h1>ตั้งเวลา<\/h1>/.test(schedulePage) && !/slotEnable\d+/.test(schedulePage) && /<label>เปิด<input/.test(schedulePage) && /onclick="saveSchedule\(\)">บันทึก<\/button>/.test(schedulePage)],
  ['Schedule page loads overlap-safe schedule.js', /schedule\.js\?v=10/.test(schedulePage)],
  ['PWA caches full-system upgrade assets', /crop-reminders\.js/.test(sw) && /crop-plots\.js/.test(sw) && /farm-analytics\.js/.test(sw) && /ai-farm-advisor\.js/.test(sw) && /farm-tools\.js/.test(sw) && /farm-clock\.js/.test(sw) && /mqtt-shared-worker\.js/.test(sw) && /user-management\.js/.test(sw)],
  ['Dashboard loads OTA controller', /dashboard-ota\.js\?v=/.test(settings) && /otaDashboardForm/.test(ota)],
  ['Dashboard explains MQTT reconnect backoff', /mqtt:reconnecting/.test(app) && /Math\.ceil\(delay \/ 1000\)/.test(app)],
  ['Standalone OTA page targets local HTTP without MQTT', /STANDALONE HTTP OTA/.test(standaloneOta) && /\/api\/status/.test(standaloneOta) && /\/update/.test(standaloneOta) && /credentials: 'omit'/.test(standaloneOta) && !/<script[^>]+src=[^>]*(?:mqtt|firebase)/i.test(standaloneOta)],
  ['Weather assets are loaded by dashboard', /weather\.js\?v=/.test(index)],
  ['Open-Meteo endpoint configured', /https:\/\/api\.open-meteo\.com\/v1\/forecast/.test(weather)],
  ['Weather protection is advisory only', /autoWateringAllowed = !blocked/.test(weather) && !/data-mode|\bAUTO\b|\bMANUAL\b/.test(guard)],
  ['No new mode MQTT contract introduced', !/modeSet|mode\/set|data-mode|\bAUTO\b|\bMANUAL\b/.test(cfg + handler + app + schedule + index + schedulePage + settings + firmware)],
  ['Emergency stop uses existing relay OFF commands', /data-emergency-stop/.test(index) && /relaySet\(relay\), 'OFF'/.test(tools)],
  ['Emergency latch has reset/status UI', /data-emergency-reset/.test(index) && /data-emergency-status/.test(index) && /emergency:status/.test(app)],
  ['Firebase rules cover user-scoped domains', /users/.test(rules) && /profile/.test(rules) && /finance/.test(rules) && /cropCycle/.test(rules) && /cropPlots/.test(rules) && /cropReminders/.test(rules) && /analytics/.test(rules) && /amount.*> 0/.test(rules)],
  ['Firebase rules validate AI history and keep twin identical', /aiAdvisor/.test(rules) && /severity.*critical/.test(rules) && rules === databaseRules],
  ['Firebase roles prevent self-admin escalation', /newData\.child\('role'\)\.val\(\) === 'user'/.test(rules) && /newData\.child\('role'\)\.val\(\) === 'admin'/.test(rules) && !/owner/.test(rules)],
  ['User management audit is server-only', /"userManagementAudit"/.test(rules) && /"\.read": false/.test(rules) && /"\.write": false/.test(rules)],
  ['Firebase rules twin is identical', rules === databaseRules],
  ['Active JavaScript has no HTML injection sinks', !/innerHTML|outerHTML|document\\.write|insertAdjacentHTML/.test(activeJs)],
  ['PWA cache matches V7.1 source of truth', /smartfarm-v7\.1-field-stability-6/.test(sw) && /SMART FARM LUNGNA V7\.1/.test(read('SYSTEM_VERSION.txt'))],
  ['Pages load latest stylesheet cache version', /app\.css\?v=34/.test(index) && /app\.css\?v=34/.test(settings) && /app\.css\?v=34/.test(schedulePage)],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed += 1;
}
if (failed) {
  console.error(`\n${failed} dashboard checks failed`);
  process.exit(1);
}
console.log(`\nDashboard runtime contract checks passed: ${checks.length}`);
