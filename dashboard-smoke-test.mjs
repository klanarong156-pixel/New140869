import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = [
  'config.js',
  'mqtt-handler.js',
  'app.js',
  'schedule.js',
  'telegram-settings.js',
  'weather.js',
  'auto-weather-guard.js',
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
const weather = read('weather.js');
const guard = read('auto-weather-guard.js');
const index = read('index.html');
const schedulePage = read('schedule.html');
const settings = read('settings.html');
const firmware = read('SmartFarm_V6_PRODUCTION.ino');

const checks = [
  ['HiveMQ WSS endpoint is configured', /wss:\/\/[^"']+:8884\/mqtt/.test(cfg)],
  ['All four relay IDs exist', /pump.*zone1.*lighthome.*lightsala/s.test(cfg)],
  ['Relay set topic exists', /relaySet:.*smartfarm\/relay/.test(cfg)],
  ['Sensor topic factory exists', /sensor: sensor =>/.test(cfg)],
  ['Mode topic exists', /modeSet: 'smartfarm\/mode\/set'/.test(cfg)],
  ['Online topic exists', /online: 'smartfarm\/status\/online'/.test(cfg)],
  ['Device status topic exists', /deviceStatus: 'smartfarm\/device\/status'/.test(cfg)],
  ['Schedule topic factory exists', /scheduleSet: relay =>/.test(cfg)],
  ['Telegram topics exist', /telegramSet: 'smartfarm\/config\/telegram\/set'/.test(cfg) && /telegramTest: 'smartfarm\/config\/telegram\/test'/.test(cfg)],
  ['Browser uses current MQTT handler', /new MqttHandler\(MQTT_CONFIG\)/.test(handler)],
  ['Current app binds data relay controls', /\[data-relay-toggle\]/.test(app)],
  ['Current app binds data mode controls', /\[data-mode\]/.test(app)],
  ['Mode commands are non-retained', /topics\.modeSet, normalized, \{ retain: false \}/.test(app)],
  ['Schedule payload uses slots/on/off schema', /return \{ slots: data \}/.test(schedule) && /JSON\.stringify\(payload\)/.test(schedule)],
  ['Schedule delete uses DELETE command', /scheduleSet\(activeRelay\), 'DELETE'/.test(schedule)],
  ['Telegram payload uses botToken/chatId', /botToken/.test(telegram) && /chatId/.test(telegram)],
  ['Telegram commands are non-retained', /retain: false/.test(telegram)],
  ['Firmware uses same broker and base topic', /#define MQTT_SERVER/.test(firmware) && /#define MQTT_BASE "smartfarm"/.test(firmware)],
  ['Firmware subscribes to relay/mode/schedule topics', /relay\/\+\/set/.test(firmware) && /mode\/set/.test(firmware) && /schedule\/\+\/set/.test(firmware)],
  ['Firmware accepts Telegram topics', /config\/telegram\/set/.test(firmware) && /config\/telegram\/test/.test(firmware)],
  ['Firmware schedule parser accepts slots/on/off', /d\["slots"\]/.test(firmware) && /o\["on"\]/.test(firmware) && /o\["off"\]/.test(firmware)],
  ['Dashboard pages load current app.js', /app\.js\?v=/.test(index) && /app\.js\?v=/.test(schedulePage) && /app\.js\?v=/.test(settings)],
  ['Weather assets are loaded by dashboard', /weather\.js\?v=/.test(index) && /auto-weather-guard\.js\?v=/.test(index)],
  ['Open-Meteo endpoint configured', /https:\/\/api\.open-meteo\.com\/v1\/forecast/.test(weather)],
  ['Rain Protection blocks AUTO', /autoWateringAllowed = !blocked/.test(weather)],
  ['AUTO button is guarded', /button\.disabled = !ready/.test(guard) && /data-mode="AUTO"/.test(guard)],
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
