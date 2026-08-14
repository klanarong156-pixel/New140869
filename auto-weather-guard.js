/* Smart Farm V6.2 — AUTO Watering guard via Open-Meteo */
(function(){
'use strict';
const POLL_MS=60*1000;
function allowed(){const w=window.SmartFarmWeather?.state;return !!(w?.ok&&w.autoWateringAllowed===true);}
function guardAuto(){const btn=document.getElementById('autoBtn');if(!btn)return;const ok=allowed();btn.disabled=!ok;btn.title=ok?'Auto Watering พร้อมทำงาน':'Rain Protection: ต้องมีข้อมูลอากาศและไม่มีเงื่อนไขฝน';}
function boot(){guardAuto();setInterval(guardAuto,POLL_MS);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.SmartFarmAutoWeatherGuard={allowed,refresh:guardAuto};
})();
