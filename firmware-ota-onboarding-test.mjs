import fs from 'node:fs';
import assert from 'node:assert/strict';

const firmware = fs.readFileSync('SmartFarm_V7.2.1_OTA_ACCESS_FIX.ino', 'utf8');
let passed = 0;
const check = (condition, label) => {
  assert.ok(condition, `FAIL: ${label}`);
  console.log(`PASS: ${label}`);
  passed++;
};

const rootStart = firmware.indexOf('otaServer.on("/", HTTP_GET');
const rootEnd = firmware.indexOf('otaServer.on("/api/status", HTTP_GET', rootStart);
assert.ok(rootStart >= 0 && rootEnd > rootStart, 'root and status routes exist');
const rootRoute = firmware.slice(rootStart, rootEnd);
const missingPasswordStart = rootRoute.indexOf('if (!otaPass[0])');
const authenticatedPageStart = rootRoute.indexOf('if (!otaHttpAuthorized())');
assert.ok(missingPasswordStart >= 0 && authenticatedPageStart > missingPasswordStart,
  'root route handles missing password before Basic Auth');
const onboarding = rootRoute.slice(missingPasswordStart, authenticatedPageStart);

check(onboarding.includes('otaServer.send(200, "text/html; charset=utf-8", page)'),
  'missing ota_pass shows a readable HTML setup page instead of a dead-end 503');
check(onboarding.includes('OPEN_AP') && onboarding.includes('SmartFarm_Setup') &&
  onboarding.includes('ota_pass') && onboarding.includes('admin'),
  'onboarding tells operator the actual portal command, SSID, setting and username');
check(onboarding.includes('ห้ามเปิดพอร์ตนี้สู่อินเทอร์เน็ต') &&
  !onboarding.includes("action='/update'") && !onboarding.includes('type=\'file\''),
  'onboarding is read-only and warns against Internet exposure');
check(rootRoute.includes('if (!otaHttpAuthorized())') &&
  rootRoute.includes('otaServer.send(200, "text/html; charset=utf-8", page)'),
  'normal firmware upload page stays behind authentication when a password exists');
check(firmware.includes('otaServer.authenticate("admin", otaPass)') &&
  firmware.includes('otaServer.on(\n      "/update", HTTP_POST') &&
  firmware.includes('otaServer.on("/api/status", HTTP_GET'),
  'upload and device status routes remain defined under the authenticated guard');
check(firmware.includes('#define SMARTFARM_VERSION "V7.2.1-OTA-ACCESS-FIX"'),
  'firmware advertises the OTA access-fix release');

console.log(`\n${passed} OTA onboarding regression checks passed.`);
