import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const files=['config.js','app-v62.js','weather.js','auto-weather-guard.js'];
for(const file of files){
  const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(r.status!==0){console.error(`SYNTAX FAIL: ${file}\n${r.stderr}`);process.exit(1);}
}
const read=f=>fs.readFileSync(f,'utf8');
const cfg=read('config.js');
const app=read('app-v62.js');
const weather=read('weather.js');
const guard=read('auto-weather-guard.js');
const index=read('index.html');
const checks=[
 ['HiveMQ WSS endpoint is configured',/wss:\/\/[^"']+:8884\/mqtt/.test(cfg)],
 ['All four relay IDs exist',/pump.*zone1.*lighthome.*lightsala/s.test(cfg)],
 ['Relay set topic exists',/smartfarm\/relay\/\$\{r\}\/set/.test(cfg)],
 ['Sensor topic exists',/smartfarm\/sensor\/\$\{t\}/.test(cfg)],
 ['Mode topic exists',/smartfarm\/mode\/set/.test(cfg)],
 ['Online topic exists',/smartfarm\/status\/online/.test(cfg)],
 ['Device status topic exists',/smartfarm\/device\/status/.test(cfg)],
 ['Heartbeat timeout is 25 seconds',/deviceHeartbeatTimeoutMs:25000/.test(cfg)],
 ['Browser uses MQTT connect',/mqtt\.connect\(cfg\.url/.test(app)],
 ['Browser reconnects automatically',/reconnectPeriod:5000/.test(app)],
 ['Pending commands are queued',/state\.pending\.push/.test(app)],
 ['ESP heartbeat is monitored',/deviceHeartbeatTimeoutMs/.test(app)],
 ['Relay controls are bound',/data-relay/.test(index)&&/setRelay\(r,el\.checked\)/.test(app)],
 ['Open-Meteo endpoint configured',/https:\/\/api\.open-meteo\.com\/v1\/forecast/.test(weather)],
 ['Configured latitude is correct',/latitude:7\.798754/.test(weather)],
 ['Configured longitude is correct',/longitude:99\.990505/.test(weather)],
 ['7-day forecast requested',/forecast_days.*7/.test(weather)],
 ['Rain probability threshold is 60%',/probabilityPercent:60/.test(weather)],
 ['6-hour precipitation threshold is 1 mm',/precipitation6hMm:1/.test(weather)],
 ['Rain Protection blocks AUTO',/autoWateringAllowed=!blocked/.test(weather)],
 ['Weather API failure blocks AUTO',/autoWateringAllowed=false/.test(weather)],
 ['AUTO requires valid weather state',/!w\?\.ok/.test(app)],
 ['AUTO requires rain protection clearance',/w\.autoWateringAllowed!==true/.test(app)],
 ['AUTO button is guarded',/btn\.disabled=!ok/.test(guard)],
 ['Weather assets are loaded by dashboard',/weather\.js\?v=1/.test(index)&&/auto-weather-guard\.js\?v=1/.test(index)],
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}  ${name}`);if(!ok)failed++;}
if(failed){console.error(`\n${failed} dashboard checks failed`);process.exit(1);}
console.log(`\nDashboard V6.2 weather checks passed: ${checks.length}`);
