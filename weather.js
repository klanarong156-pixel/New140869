/* Smart Farm V6.2 Weather Layer — Open-Meteo, no API key */
(function(){
'use strict';
const WEATHER_CONFIG=Object.freeze({
  latitude:7.798754,
  longitude:99.990505,
  utm:'47N / X 609211 / Y 862178',
  timezone:'Asia/Bangkok',
  refreshMs:15*60*1000,
  rainProtection:{probabilityPercent:60,precipitation6hMm:1}
});
const WEATHER_ENDPOINT='https://api.open-meteo.com/v1/forecast';
const state={ok:false,loading:false,lastSuccess:0,data:null,autoWateringAllowed:false,reason:'รอข้อมูลสภาพอากาศ'};
const $=id=>document.getElementById(id);
function set(id,value){const e=$(id);if(e)e.textContent=value;}
function esc(v){return String(v??'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\"':'&quot;'}[m]));}
function buildUrl(){
  const u=new URL(WEATHER_ENDPOINT);
  u.searchParams.set('latitude',WEATHER_CONFIG.latitude);
  u.searchParams.set('longitude',WEATHER_CONFIG.longitude);
  u.searchParams.set('timezone',WEATHER_CONFIG.timezone);
  u.searchParams.set('forecast_days','7');
  u.searchParams.set('current','temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m,weather_code');
  u.searchParams.set('hourly','temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,rain,wind_speed_10m,weather_code');
  u.searchParams.set('daily','weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,precipitation_probability_max,wind_speed_10m_max');
  return u.toString();
}
function sixHourRain(hourly){
  const times=hourly?.time||[], vals=hourly?.precipitation||[];
  if(!times.length)return NaN;
  const now=Date.now(), end=now+6*60*60*1000;
  let sum=0;
  for(let i=0;i<times.length;i++){
    const t=Date.parse(times[i]);
    if(Number.isFinite(t)&&t>=now&&t<end)sum+=Number(vals[i])||0;
  }
  return sum;
}
function rainProbabilityNext6h(hourly){
  const times=hourly?.time||[], vals=hourly?.precipitation_probability||[];
  const now=Date.now(), end=now+6*60*60*1000;
  let max=0,seen=false;
  for(let i=0;i<times.length;i++){
    const t=Date.parse(times[i]);
    if(Number.isFinite(t)&&t>=now&&t<end){max=Math.max(max,Number(vals[i])||0);seen=true;}
  }
  return seen?max:NaN;
}
function calculateProtection(d){
  const p=rainProbabilityNext6h(d.hourly), mm=sixHourRain(d.hourly);
  const blocked=(Number.isFinite(p)&&p>=WEATHER_CONFIG.rainProtection.probabilityPercent) || (Number.isFinite(mm)&&mm>=WEATHER_CONFIG.rainProtection.precipitation6hMm);
  state.autoWateringAllowed=!blocked;
  state.reason=blocked ? `Rain Protection: โอกาสฝน ${Number.isFinite(p)?p.toFixed(0):'--'}% หรือฝน 6 ชม. ${Number.isFinite(mm)?mm.toFixed(1):'--'} mm` : 'สภาพอากาศอนุญาตให้ Auto Watering';
  return {p,mm,blocked};
}
function weatherText(code){const m={0:'ท้องฟ้าแจ่มใส',1:'มีเมฆเล็กน้อย',2:'มีเมฆบางส่วน',3:'เมฆมาก',45:'หมอก',48:'หมอกเกาะตัว',51:'ฝนปรอย',53:'ฝนปรอย',55:'ฝนปรอย',61:'ฝนเล็กน้อย',63:'ฝนปานกลาง',65:'ฝนหนัก',71:'หิมะตกเล็กน้อย',73:'หิมะตก',75:'หิมะตกหนัก',80:'ฝนซู่',81:'ฝนซู่ปานกลาง',82:'ฝนซู่หนัก',95:'พายุฝนฟ้าคะนอง',96:'พายุฝนลูกเห็บ',99:'พายุฝนลูกเห็บ'};return m[code]||`Weather code ${code}`;}
function render(d,protect){
  const c=d.current||{};set('weatherTemp',Number(c.temperature_2m).toFixed(1)+' °C');set('weatherHumidity',Number(c.relative_humidity_2m).toFixed(0)+' %');set('weatherRainProb',Number.isFinite(protect.p)?protect.p.toFixed(0)+' %':'--');set('weatherWind',Number(c.wind_speed_10m).toFixed(1)+' km/h');set('weatherCondition',weatherText(c.weather_code));set('weatherUpdated',new Date().toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}));set('rainProtectionStatus',state.autoWateringAllowed?'✅ Auto Watering อนุญาต':'🛑 Auto Watering ถูกงด');set('rainProtectionReason',state.reason);
  const loc=$('weatherLocation');if(loc)loc.textContent=`📍 ${WEATHER_CONFIG.latitude}, ${WEATHER_CONFIG.longitude} • UTM ${WEATHER_CONFIG.utm}`;
  const box=$('weatherBox');if(box)box.classList.toggle('weather-blocked',!state.autoWateringAllowed);
  const daily=d.daily||{}, wrap=$('forecast7');if(wrap){wrap.innerHTML='';(daily.time||[]).forEach((day,i)=>{const el=document.createElement('div');el.className='forecast-day';el.innerHTML=`<b>${new Date(day+'T12:00:00').toLocaleDateString('th-TH',{weekday:'short',day:'numeric',month:'short',timeZone:'Asia/Bangkok'})}</b><span>${weatherText(daily.weather_code?.[i])}</span><span>🌡️ ${Number(daily.temperature_2m_min?.[i]).toFixed(0)}–${Number(daily.temperature_2m_max?.[i]).toFixed(0)}°C</span><span>☔ ${Number(daily.precipitation_probability_max?.[i]).toFixed(0)}%</span><span>💧 ${Number(daily.precipitation_sum?.[i]).toFixed(1)} mm</span>`;wrap.appendChild(el);});}
  window.SmartFarmWeather.state=state;window.SmartFarmWeather.data=d;window.SmartFarmWeather.rainProtection=protect;
}
async function refresh(){if(state.loading)return;state.loading=true;try{const r=await fetch(buildUrl(),{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();const protect=calculateProtection(d);state.ok=true;state.lastSuccess=Date.now();state.data=d;render(d,protect);}catch(e){state.ok=false;state.autoWateringAllowed=false;state.reason='Open-Meteo API ขัดข้อง — ระบบป้องกัน: งด Auto Watering';set('rainProtectionStatus','🛑 Auto Watering ถูกงด');set('rainProtectionReason',state.reason);console.error('Open-Meteo',e);window.SmartFarmWeather.state=state;}finally{state.loading=false;}}
function ensurePanel(){const root=document.querySelector('#app');if(!root||document.getElementById('weatherBox'))return;const panel=document.createElement('section');panel.className='panel weather-panel';panel.id='weatherBox';panel.innerHTML=`<div class="panel-head"><div><p class="eyebrow">OPEN-METEO</p><h2>สภาพอากาศและ Rain Protection</h2><span id="weatherLocation" class="summary"></span></div><span class="hint">ไม่ใช้ API Key</span></div><div class="weather-grid"><article class="metric-card"><div class="metric-icon">🌡️</div><div><b>อุณหภูมิ</b><strong id="weatherTemp">-- °C</strong></div></article><article class="metric-card"><div class="metric-icon">💧</div><div><b>ความชื้น</b><strong id="weatherHumidity">-- %</strong></div></article><article class="metric-card"><div class="metric-icon">🌧️</div><div><b>โอกาสฝน 6 ชม.</b><strong id="weatherRainProb">-- %</strong></div></article><article class="metric-card"><div class="metric-icon">💨</div><div><b>ความเร็วลม</b><strong id="weatherWind">-- km/h</strong></div></article></div><p id="weatherCondition" class="summary">กำลังโหลด…</p><div class="rain-protection"><strong id="rainProtectionStatus">🛑 Auto Watering ถูกงด</strong><span id="rainProtectionReason">รอข้อมูลสภาพอากาศ</span></div><div class="forecast-wrap"><h3>📅 Forecast 7 วัน</h3><div id="forecast7" class="forecast-grid"></div></div><p id="weatherUpdated" class="summary"></p></section>`;const anchor=document.querySelector('.cards');if(anchor)anchor.insertAdjacentElement('afterend',panel);else root.insertBefore(panel,root.firstChild);}
window.SmartFarmWeather={config:WEATHER_CONFIG,state,data:null,rainProtection:null,refresh,buildUrl};
function boot(){ensurePanel();refresh();setInterval(refresh,WEATHER_CONFIG.refreshMs);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
