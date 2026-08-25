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
  'farm-tools.js',
  'mqtt-shared-worker.js',
  'weather.js',
  'auto-weather-guard.js',
  'dashboard-ota.js',
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
const tools = read('farm-tools.js');
const worker = read('mqtt-shared-worker.js');
const weather = read('weather.js');
const guard = read('auto-weather-guard.js');
const ota = read('dashboard-ota.js');
const index = read('index.html');
const schedulePage = read('schedule.html');
const settings = read('settings.html');
const firmware = read('SmartFarm_V6_PRODUCTION.ino');
const sw = read('sw.js');

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
  ['Browser uses current MQTT handler', /new MqttHandler\(MQTT_CONFIG\)/.test(handler)],
  ['SharedWorker keeps one MQTT connection across pages', /new SharedWorker/.test(handler) && /mqtt-shared-worker\.js/.test(handler) && /importScripts\('mqtt\.min\.js/.test(worker)],
  ['Current app binds relay controls', /\[data-relay-toggle\]/.test(app)],
  ['Unlimited timer command is supported', /seconds === 'UNLIMITED'/.test(app) && /UNLIMITED/.test(firmware)],
  ['Schedule payload uses slots/on/off schema', /return \{ slots: data \}/.test(schedule) && /JSON\.stringify\(payload\)/.test(schedule)],
  ['Schedule delete uses DELETE command', /scheduleSet\(activeRelay\), 'DELETE'/.test(schedule)],
  ['Telegram payload uses botToken/chatId', /botToken/.test(telegram) && /chatId/.test(telegram)],
  ['Telegram commands are non-retained', /retain: false/.test(telegram)],
  ['Reminder UI stores tasks and sends settings', /cropReminders/.test(reminders) && /reminderSet/.test(reminders) && /farm\/cropReminders/.test(reminders)],
  ['Reminder supports plots, recurrence and quiet-hour payload', /plotId/.test(reminders) && /repeatEveryDays/.test(reminders) && /quietStartHour/.test(reminders) && /quietEndHour/.test(reminders)],
  ['Schedule page contains reminder management UI', /id="crop-reminders"/.test(schedulePage) && /reminderSettingsForm/.test(schedulePage) && /reminderForm/.test(schedulePage)],
  ['Multiple plot model is bounded and persisted', /MAX_PLOTS = 8/.test(plots) && /farm\/cropPlots/.test(plots) && /textContent/.test(plots)],
  ['Analytics stores real sensor history and renders chart', /sensor:data/.test(analytics) && /sensorHistoryChart/.test(analytics) && /getContext\('2d'\)/.test(analytics) && !/Math\.random/.test(analytics)],
  ['Backup excludes secrets and supports restore', /SECRET_KEY/.test(tools) && /downloadJson/.test(tools) && /FirebaseDB\.put/.test(tools)],
  ['Firmware uses same broker and base topic', /#define MQTT_SERVER/.test(firmware) && /#define MQTT_BASE "smartfarm"/.test(firmware)],
  ['Firmware subscribes to relay/timer/schedule topics', /relay\/\+\/set/.test(firmware) && /timer\/set/.test(firmware) && /schedule\/\+\/set/.test(firmware)],
  ['Firmware accepts Telegram topics', /config\/telegram\/set/.test(firmware) && /config\/telegram\/test/.test(firmware)],
  ['Firmware accepts reminder topic and persists reminders', /reminder\/set/.test(firmware) && /smartfarm_reminders\.json/.test(firmware) && /runReminders/.test(firmware)],
  ['Firmware deduplicates sent reminders', /lastSentDate/.test(firmware) && /send_failed/.test(firmware)],
  ['Firmware schedule parser accepts slots/on/off', /d\["slots"\]/.test(firmware) && /o\["on"\]/.test(firmware) && /o\["off"\]/.test(firmware)],
  ['Dashboard pages load current app.js', /app\.js\?v=/.test(index) && /app\.js\?v=/.test(schedulePage) && /app\.js\?v=/.test(settings)],
  ['PWA caches full-system upgrade assets', /crop-reminders\.js/.test(sw) && /crop-plots\.js/.test(sw) && /farm-analytics\.js/.test(sw) && /farm-tools\.js/.test(sw) && /mqtt-shared-worker\.js/.test(sw)],
  ['Dashboard loads OTA controller', /dashboard-ota\.js\?v=/.test(settings) && /otaDashboardForm/.test(ota)],
  ['Weather assets are loaded by dashboard', /weather\.js\?v=/.test(index)],
  ['Open-Meteo endpoint configured', /https:\/\/api\.open-meteo\.com\/v1\/forecast/.test(weather)],
  ['Weather protection is advisory only', /autoWateringAllowed = !blocked/.test(weather) && !/data-mode|\bAUTO\b|\bMANUAL\b/.test(guard)],
  ['No new mode MQTT contract introduced', !/modeSet|mode\/set|data-mode|\bAUTO\b|\bMANUAL\b/.test(cfg + handler + app + schedule + index + schedulePage + settings + firmware)],
  ['Emergency stop uses existing relay OFF commands', /data-emergency-stop/.test(index) && /relaySet\(relay\), 'OFF'/.test(tools)],
  ['Dashboard loads latest stylesheet cache version', /app\.css\?v=13/.test(index) && /app\.css\?v=13/.test(schedulePage) && /app\.css\?v=13/.test(settings)],
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
