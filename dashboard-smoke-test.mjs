import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = [
  'config.js','mqtt-connection.js','app.js','schedule.js','telegram-settings.js',
  'crop-reminders.js','crop-plots.js','farm-analytics.js','ai-farm-advisor.js',
  'farm-tools.js','farm-clock.js','internet-time.js','user-management.js',
  'weather.js','auto-weather-guard.js','dashboard-ota.js','finance.js'
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
const mqtt = read('mqtt-connection.js');
const app = read('app.js');
const index = read('index.html');
const cleanDashboard = read('dashboard/index.html');
const cleanDashboardConfig = read('dashboard/dashboard-config.js');
const cleanDashboardState = read('dashboard/dashboard-state.js');
const cleanDashboardMqtt = read('dashboard/dashboard-mqtt.js');
const cleanDashboardJs = read('dashboard/dashboard.js');
const finance = read('finance.html');
const financeJs = read('finance.js');
const dashboardCss = read('dashboard/dashboard.css');
const firmware = read('SmartFarm_V7.1.2_TLS_TIME_COMPILE_FIX.ino');
const sw = read('sw.js');

const checks = [
  ['Current MQTT owner exists', fs.existsSync('mqtt-connection.js') && !fs.existsSync('mqtt-handler.js')],
  ['Legacy SharedWorker removed', !fs.existsSync('mqtt-shared-worker.js') && !/mqtt-shared-worker\.js/.test(sw)],
  ['Browser uses HiveMQ WSS 8884 /mqtt', /protocol: 'wss:'/.test(cfg) && /port: 8884/.test(cfg) && /path: '\/mqtt'/.test(cfg)],
  ['Broker host is allowlisted', /MQTT_ALLOWED_BROKER_HOSTS/.test(cfg) && /25305924f68c41f2a1e089a1836d3287\.s1\.eu\.hivemq\.cloud/.test(cfg)],
  ['MQTT.js is the only browser connection owner', /mqtt\.connect\(this\.config\.url/.test(mqtt) && /reconnectPeriod: 3000/.test(mqtt) && !/new SharedWorker/.test(mqtt)],
  ['MQTT credentials persist locally', /localStorage\.setItem\(this\.storageUser/.test(mqtt) && /localStorage\.getItem\(this\.storagePass/.test(mqtt)],
  ['Canonical dashboard connection route has credential inputs', /data-mqtt-username/.test(cleanDashboard) && /data-mqtt-password/.test(cleanDashboard) && /data-credential-form/.test(cleanDashboard)],
  ['Root routes to isolated clean dashboard', /dashboard\//.test(index) && !/mqtt-handler\.js/.test(index)],
  ['Clean dashboard has one MQTT owner', /mqtt\.connect\(mqttConfig\.url/.test(cleanDashboardMqtt) && /reconnectPeriod: 3000/.test(cleanDashboardMqtt) && !/mqtt-connection\.js|mqtt-handler\.js/.test(cleanDashboard)],
  ['Clean dashboard has state layer', /SmartFarmDashboardState/.test(cleanDashboardState) && /acceptHeartbeat/.test(cleanDashboardState)],
  ['Clean dashboard uses explicit firmware topics', /status\/device/.test(cleanDashboardConfig) && /sensor\/dht11/.test(cleanDashboardConfig) && /relaySet/.test(cleanDashboardConfig)],
  ['Clean dashboard loads MQTT.js and state modules', /mqtt\.min\.js/.test(cleanDashboard) && /dashboard-state\.js/.test(cleanDashboard) && /dashboard-mqtt\.js/.test(cleanDashboard)],
  ['Dashboard modes match firmware commands', /data-mode="AUTO"/.test(cleanDashboard) && /data-mode="MANUAL"/.test(cleanDashboard) && !/data-mode="SCHEDULE"/.test(cleanDashboard)],
  ['Dashboard exposes firmware emergency controls', /data-emergency-stop/.test(cleanDashboard) && /data-emergency-reset/.test(cleanDashboard) && /emergencySet/.test(cleanDashboardConfig)],
  ['Clean dashboard does not fake soil telemetry', /ไม่ได้ติดตั้ง/.test(cleanDashboard) && !/soil.*(?:value|temperature|humidity)/i.test(cleanDashboardJs)],
  ['Firmware uses HiveMQ TLS 8883', /#define MQTT_SERVER "25305924f68c41f2a1e089a1836d3287\.s1\.eu\.hivemq\.cloud"/.test(firmware) && /#define MQTT_PORT 8883/.test(firmware)],
  ['Firmware uses smartfarm base topic', /#define MQTT_BASE "smartfarm"/.test(firmware)],
  ['Firmware heartbeat contract exists', firmware.includes('MQTT_BASE "/status/device"') && firmware.includes('MQTT_BASE "/status/online"') && /uptimeSec/.test(firmware)],
  ['Firmware DHT11 contract exists', firmware.includes('MQTT_BASE "/sensor/dht11"') && /DHT11/.test(firmware)],
  ['Firmware command topics are explicit', /MQTT_COMMAND_TOPICS/.test(firmware) && !/mqtt\.subscribe\(MQTT_BASE "\/#"\)/.test(firmware)],
  ['No fake soil sensor telemetry in unified dashboard', !/soil.*(?:value|temperature|humidity)/i.test(cleanDashboard)],
  ['Legacy duplicate pages are removed from service worker', !/connection\.html|schedule\.html|settings\.html/.test(sw)],
  ['Finance monthly report UI exists', /financeReportMonth/.test(finance) && /monthlyIncome/.test(finance) && /monthlyCategoryRows/.test(finance)],
  ['Finance monthly report calculates from loaded items', /monthlyItems/.test(financeJs) && /renderMonthlyReport/.test(financeJs) && /monthKey/.test(financeJs)],
  ['Finance legacy entry form is restored', /id="financeForm"/.test(finance) && /id="financeType"/.test(finance) && /id="financeAmount"/.test(finance) && /id="financeItem"/.test(finance) && /id="financeSubmit"/.test(finance)],
  ['Dashboard routes share the renovated theme', /data-page-section="water"/.test(cleanDashboard) && /data-page-section="devices"/.test(cleanDashboard) && /data-page-section="connection"/.test(cleanDashboard) && /data-page-section="weather"/.test(cleanDashboard) && /data-page-section="settings"/.test(cleanDashboard) && /\.route-page\[hidden\]/.test(dashboardCss)]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
if (failed) {
  console.error(`\n${failed} current-architecture checks failed`);
  process.exit(1);
}
console.log(`\nCurrent Smart Farm architecture checks passed: ${checks.length}`);
