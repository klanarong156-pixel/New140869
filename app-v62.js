/* SmartFarm V6.2 standalone dashboard
 * One transport: MQTT over WSS. No Firebase/auth dependency.
 */
(function(){
'use strict';
const cfg=window.MQTT_CONFIG;
const relays=['pump','zone1','lighthome','lightsala'];
const state={client:null,connecting:false,mqtt:false,esp:false,lastSeen:0,mode:'MANUAL',relay:{pump:false,zone1:false,lighthome:false,lightsala:false},pending:[],retry:null};
const $=id=>document.getElementById(id);
const set=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
function mqttBadge(on,text){const e=$('mqttStatus');if(!e)return;e.classList.toggle('online',!!on);e.classList.toggle('offline',!on);e.innerHTML='<i></i> '+text;}
function espBadge(on){const e=$('deviceStatus');if(e){e.classList.toggle('online',!!on);e.classList.toggle('offline',!on);e.innerHTML='<i></i> ESP8266 '+(on?'ออนไลน์':'ออฟไลน์');}set('heroEsp',on?'ออนไลน์':'ออฟไลน์');set('deviceStatusCard',on?'ออนไลน์':'ออฟไลน์');}
function mode(m){state.mode=m.toUpperCase();set('heroMode',state.mode);set('modeCard',state.mode);set('modeCard2',state.mode);}
function notice(text,type){const e=$('connectionBox');if(!e)return;e.textContent=text;e.className='status-box '+(type||'warning');}
function markSeen(){state.lastSeen=Date.now();if(!state.esp){state.esp=true;espBadge(true);}}
function watchdog(){if(state.lastSeen&&Date.now()-state.lastSeen>cfg.deviceHeartbeatTimeoutMs&&state.esp){state.esp=false;espBadge(false);}}
function credentials(){return {username:String(cfg.username||''),password:String(cfg.password||'')};}
function subscribe(){cfg.allowedSubscribeTopics.forEach(t=>state.client.subscribe(t,{qos:0},e=>{if(e)console.error('subscribe',t,e);}));}
function flush(){if(!state.client?.connected)return;const now=Date.now();const q=state.pending.splice(0);q.forEach(x=>{if(now-x.at<=30000)state.client.publish(x.t,String(x.p));});}
function connect(){
 if(typeof mqtt==='undefined'){notice('โหลด MQTT library ไม่สำเร็จ','warning');return;}
 if(state.client?.connected||state.connecting)return;
 const c=credentials();if(!c.username||!c.password){notice('ไม่พบ MQTT Username/Password ใน config.js','warning');return;}
 state.connecting=true;mqttBadge(false,'MQTT กำลังเชื่อมต่อ');notice('กำลังเชื่อมต่อ HiveMQ Cloud ผ่าน WSS 8884…','warning');
 try{state.client=mqtt.connect(cfg.url,{clientId:cfg.clientId,username:c.username,password:c.password,clean:true,reconnectPeriod:5000,connectTimeout:30000,keepalive:30});}
 catch(e){state.connecting=false;notice('สร้าง MQTT connection ไม่สำเร็จ: '+e.message,'warning');return;}
 state.client.on('connect',()=>{state.connecting=false;state.mqtt=true;mqttBadge(true,'MQTT เชื่อมต่อแล้ว');notice('MQTT เชื่อมต่อสำเร็จ • รอข้อมูลจาก ESP8266…','success');subscribe();flush();});
 state.client.on('message',(t,m)=>message(t,m.toString()));
 state.client.on('reconnect',()=>{state.connecting=true;mqttBadge(false,'MQTT กำลังเชื่อมต่อใหม่');});
 state.client.on('close',()=>{state.connecting=false;state.mqtt=false;mqttBadge(false,'MQTT หลุด • กำลังเชื่อมใหม่');notice('MQTT หลุด ระบบกำลังเชื่อมต่อใหม่อัตโนมัติ','warning');});
 state.client.on('error',e=>{console.error('MQTT',e);notice('MQTT Error: '+(e?.message||e),'warning');});
}
function message(topic,payload){
 const s=String(payload).trim();
 if(topic===cfg.topics.online){const on=['true','online','1','yes'].includes(s.toLowerCase());if(on)markSeen();else{state.esp=false;espBadge(false);}return;}
 if(topic===cfg.topics.deviceStatus){try{const d=JSON.parse(s);if(d.online===false){state.esp=false;espBadge(false);}else markSeen();if(d.mode)mode(d.mode);}catch(_){markSeen();}return;}
 if(topic===cfg.topics.modeStatus){const m=s.toUpperCase();if(m==='AUTO'||m==='MANUAL'){mode(m);markSeen();}return;}
 if(topic===cfg.topics.sensor('dht11')){try{const d=JSON.parse(s);const temp=Number(d.temperature??d.temp),hum=Number(d.humidity??d.hum);if(Number.isFinite(temp))set('temperature',temp.toFixed(1)+' °C');if(Number.isFinite(hum))set('humidity',hum.toFixed(1)+' %');markSeen();}catch(_){}};
 if(topic.startsWith('smartfarm/relay/')&&topic.endsWith('/status')){const p=topic.split('/'),r=p[2],v=s.toUpperCase();if(relays.includes(r)){const on=v==='ON'||v==='1'||v==='TRUE';state.relay[r]=on;const el=$(r+'Toggle');if(el)el.checked=on;markSeen();}}
}
function publish(t,p){if(!state.client?.connected){state.pending.push({t,p,at:Date.now()});connect();return true;}state.client.publish(t,String(p));return true;}
function setRelay(r,on){if(!relays.includes(r))return;state.relay[r]=on;const el=$(r+'Toggle');if(el)el.checked=on;publish(cfg.topics.relaySet(r),on?'ON':'OFF');}
window.setFarmMode=m=>{const modeName=String(m).toUpperCase();publish(cfg.topics.modeSet,modeName);mode(modeName);};
function bind(){relays.forEach(r=>{const el=$(r+'Toggle');if(el)el.addEventListener('change',()=>setRelay(r,el.checked));});$('manualBtn')?.addEventListener('click',()=>window.setFarmMode('MANUAL'));$('autoBtn')?.addEventListener('click',()=>window.setFarmMode('AUTO'));}
function clock(){const c=$('clock');if(!c)return;c.textContent=new Intl.DateTimeFormat('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'Asia/Bangkok'}).format(new Date());}
function boot(){bind();clock();setInterval(clock,1000);setInterval(watchdog,5000);connect();}
window.SmartFarmV62={state,connect,publish,setRelay,setFarmMode:window.setFarmMode};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
