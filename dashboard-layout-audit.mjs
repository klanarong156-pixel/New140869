import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('redesign-lambo.css', 'utf8');
const checks = [];
const add = (name, ok) => checks.push({ name, ok });
const hasOrder = (text, order) => css.includes(`${text} { order: ${order}; }`);
const quickControlOrder = '#control > .control-grid > .control-card:not(.pump-hero-card)';
add('Header precedes Pump Hero', hasOrder('body.dashboard-page .app-main > .dashboard-header', 1) && hasOrder('body.dashboard-page #control > .control-grid > .pump-hero-card', 2));
add('Pump Hero precedes Sensor', hasOrder('body.dashboard-page #control > .control-grid > .pump-hero-card', 2) && hasOrder('body.dashboard-page .app-main > .sensor-overview', 3));
add('Sensor precedes Quick Control', hasOrder('body.dashboard-page .app-main > .sensor-overview', 3) && hasOrder(`body.dashboard-page ${quickControlOrder}`, 4));
add('Quick Control precedes Cucumber Plot', hasOrder(`body.dashboard-page ${quickControlOrder}`, 4) && hasOrder('body.dashboard-page .app-main > #cropCycleCard', 5));
add('Cucumber Plot precedes Quick Actions', hasOrder('body.dashboard-page .app-main > #cropCycleCard', 5) && hasOrder('body.dashboard-page .app-main > .dashboard-quick-actions', 6));
add('Quick Actions remain after Cucumber Plot', hasOrder('body.dashboard-page .app-main > .dashboard-quick-actions', 6));
add('Removed lower layers are absent', !html.includes('compact-schedule-summary') && !html.includes('control-safety') && !html.includes('compact-system-status'));
add('Dashboard contains exactly two visible sensor cards', (html.match(/class="card metric-card interactive sensor-card/g) || []).length === 2);
add('Dashboard does not render soil sensor', !/soil|ดิน|ความชื้นดิน/i.test(html));
add('Quick controls are three-up on mobile', css.includes('body.dashboard-page #control .control-card:not(.pump-hero-card) {\n  width: auto;\n  grid-column: span 4;'));
add('MQTT is visually secondary', css.includes('body.dashboard-page .mqtt-live-panel { margin-top: 18px;'));
add('Existing relay IDs remain intact', ['pump', 'zone1', 'lighthome', 'lightsala'].every(id => html.includes(`data-relay-card="${id}"`)));
add('Pump Hero has reference toggle hook', html.includes('class="pump-toggle"') && html.includes('data-relay-toggle="pump"'));
add('Existing bottom navigation has five routes', (html.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/)?.[0].match(/<a /g) || []).length === 5);

let failed = 0;
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`);
  if (!check.ok) failed += 1;
}
console.log(`Dashboard layout audit: ${checks.length - failed} passed, ${failed} failed`);
if (failed) process.exit(1);
