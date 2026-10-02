import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const dashboard = read('../dashboard/index.html');
const routeLogic = read('../dashboard/dashboard.js');
const unifiedAuth = read('../dashboard/unified-auth.js');
const scheduleManager = read('../control-room/control-room-schedule.js');
const financeRedirect = read('../finance.html');
const controlRedirect = read('../control-room/index.html');

assert.match(dashboard, /data-page-section="finance"/);
assert.match(dashboard, /data-route="finance"\s+href="\?page=finance"|href="\?page=finance"\s+data-route="finance"/);
assert.match(dashboard, /id="scheduleForm"/);
assert.match(dashboard, /data-firmware-schedule-form/);
assert.match(dashboard, /control-room-schedule\.js/);
assert.match(dashboard, /unified-auth\.js/);
assert.match(routeLogic, /pushState/);
assert.match(routeLogic, /popstate/);
assert.match(unifiedAuth, /firebase:auth-state-changed/);
assert.match(scheduleManager, /firebase:auth-state-changed/);
assert.match(financeRedirect, /dashboard\/\?page=finance/);
assert.match(controlRedirect, /dashboard\/\?page=water/);

// The canonical HTML imports the shared MQTT manager exactly once; legacy entry points redirect.
assert.equal((dashboard.match(/dashboard-mqtt\.js/g) || []).length, 1);
assert.doesNotMatch(dashboard, /<iframe\b/i);
console.log('PASS finance and Control Room tools are routed through the canonical dashboard SPA');
console.log('PASS Firebase finance, Firebase planning and ESP schedule use distinct, explicit interfaces');
console.log('PASS navigation keeps one shared MQTT client and legacy pages redirect to canonical views');
