import fs from 'node:fs';
import assert from 'node:assert/strict';

const firmware = fs.readFileSync('SmartFarm_V7.2.3_REMOTE_WIFI_RESET.ino', 'utf8');
const config = fs.readFileSync('dashboard/dashboard-config.js', 'utf8');
const state = fs.readFileSync('dashboard/dashboard-state.js', 'utf8');
const dashboard = fs.readFileSync('dashboard/dashboard.js', 'utf8');
const mqtt = fs.readFileSync('dashboard/dashboard-mqtt.js', 'utf8');
const html = fs.readFileSync('dashboard/index.html', 'utf8');
const contract = fs.readFileSync('MQTT_CONTRACT_V6.md', 'utf8');
let passed = 0;
const check = (condition, label) => {
  assert.ok(condition, `FAIL: ${label}`);
  console.log(`PASS: ${label}`);
  passed++;
};

check(firmware.includes('#define SMARTFARM_VERSION "V7.2.3-REMOTE-WIFI-RESET"'), 'firmware has the new remote Wi-Fi reset identity');
check(/bool autoMode\s*=\s*false\s*;/.test(firmware), 'firmware still boots in MANUAL mode');
check(firmware.includes('MQTT_BASE "/wifi/reset/set"') && firmware.includes('MQTT_COMMAND_TOPICS'), 'firmware subscribes to an isolated reset command topic');
const resetBranchStart = firmware.indexOf('if (t == MQTT_BASE "/wifi/reset/set")');
const resetBranchEnd = firmware.indexOf('if (t == MQTT_BASE "/config/telegram/set")', resetBranchStart);
const resetBranch = firmware.slice(resetBranchStart, resetBranchEnd);
check(resetBranchStart >= 0 && resetBranchEnd > resetBranchStart && resetBranch.includes('msg.equals("RESET")'), 'firmware accepts only the exact RESET payload');
check(resetBranch.includes('clearSavedWifiSettings(F("MQTT WiFi reset confirmed"), true)'), 'accepted reset clears saved Wi-Fi settings and restarts');
check(firmware.includes('wm.resetSettings();') && firmware.includes('WiFi.disconnect(true);') && firmware.includes('wm.autoConnect("SmartFarm_Setup")'), 'reset returns to the SmartFarm_Setup Wi-Fi portal');
check(firmware.includes('d["ip"] = WiFi.localIP().toString();') && firmware.includes('d["heapMaxBlock"]') && firmware.includes('d["httpOtaPort"]'), 'heartbeat includes IP and ESP/OTA diagnostics');
check(config.includes("remoteWifiResetFirmware: 'V7.2.3-REMOTE-WIFI-RESET'") && config.includes("wifiResetSet: 'smartfarm/wifi/reset/set'"), 'dashboard config maps reset to the supported firmware and command topic');
check(state.includes('current.esp.otaPort =') && state.includes('current.esp.httpOtaPort =') && state.includes('current.esp.ip ='), 'dashboard state parses IP and OTA port diagnostics');
check(dashboard.includes('current.esp.firmware === config.remoteWifiResetFirmware') && dashboard.includes('current.esp.online === true') && dashboard.includes('mqtt.client?.connected === true'), 'dashboard gates reset on firmware match, live heartbeat and MQTT');
check(dashboard.includes('elements.wifiResetDialog.showModal()') && dashboard.includes("$('[data-wifi-reset-confirm]')"), 'dashboard opens a native confirmation dialog before sending');
check(dashboard.includes('retained snapshot') && dashboard.includes("smartfarm:mqtt:publish-error") && dashboard.includes('MQTT publish error'), 'dashboard distinguishes retained heartbeat and reports reset publish failures');
check(mqtt.includes("{ qos: 1, retain: false }"), 'shared MQTT publisher uses QoS 1 and never retains reset commands');
check(html.includes('data-wifi-reset-dialog') && html.includes('data-wifi-reset-confirm') && html.includes('SmartFarm_Setup'), 'dashboard renders the confirmation, cancel and setup instructions');
check(contract.includes('`smartfarm/wifi/reset/set`') && contract.includes('non-retained') && contract.includes('V7.2.3-REMOTE-WIFI-RESET'), 'MQTT contract documents reset topic, compatibility and non-retained delivery');

console.log(`\n${passed} V7.2.3 firmware/dashboard contract checks passed.`);
