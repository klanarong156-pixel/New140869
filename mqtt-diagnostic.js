(function(){
'use strict';
const S={state:'disconnected',lastConnectedAt:0,lastDisconnectedAt:0,reconnectCount:0,lastReason:'initial',lastError:'',history:[]};
const fmt=t=>t?new Intl.DateTimeFormat('th-TH',{dateStyle:'short',timeStyle:'medium'}).format(new Date(t)):'—';
function reason(d){return d&&d.message?String(d.message):'MQTT connection event';}
function render(){
 const root=document.querySelector('[data-mqtt-diagnostic-root]'); if(!root)return;
 const label=S.state==='connected'?'Connected':S.state==='reconnecting'?'Reconnecting':'Disconnected';
 root.querySelector('[data-mqtt-diagnostic-state]').textContent=label;
 root.querySelector('[data-mqtt-diagnostic-state]').dataset.state=S.state;
 root.querySelector('[data-mqtt-last-connected]').textContent=fmt(S.lastConnectedAt);
 root.querySelector('[data-mqtt-last-disconnected]').textContent=fmt(S.lastDisconnectedAt);
 root.querySelector('[data-mqtt-reconnect-count]').textContent=String(S.reconnectCount);
 root.querySelector('[data-mqtt-disconnect-reason]').textContent=S.lastReason||'—';
 root.querySelector('[data-mqtt-last-error]').textContent=S.lastError||'ไม่มี error ล่าสุด';
 root.querySelector('[data-mqtt-diagnostic-detail]').textContent=S.state==='connected'?'เชื่อมต่อกับ broker แล้ว':S.state==='reconnecting'?'กำลังเชื่อมต่อใหม่':'ไม่ได้เชื่อมต่อ';
 const h=root.querySelector('[data-mqtt-diagnostic-history]'); h.replaceChildren(...S.history.slice(-6).reverse().map(x=>{const r=document.createElement('div');r.className='mqtt-diag-row';r.textContent=fmt(x.timestamp)+' · '+x.state+' · '+x.reason;return r;}));
}
function record(state,why,err){
 const now=Date.now();
 if(state==='connected')S.lastConnectedAt=now;
 if(state==='disconnected')S.lastDisconnectedAt=now;
 if(state==='reconnecting'&&S.state!=='reconnecting')S.reconnectCount++;
 S.state=state; S.lastReason=why||S.lastReason; if(err)S.lastError=String(err);
 S.history.push({state,timestamp:now,reason:S.lastReason}); S.history=S.history.slice(-20); render();
}
function install(){
 if(!window.mqttHandler||window.mqttHandler.__diagnosticInstalled)return;
 const h=window.mqttHandler, original=h.disconnect.bind(h);
 h.disconnect=function(){record('disconnected','Dashboard/UI requested disconnect');return original(...arguments)};
 h.__diagnosticInstalled=true;
 window.addEventListener('mqtt:connected',e=>record(e.detail?'connected':'disconnected',e.detail?'MQTT connection established':'broker/socket closed'));
 window.addEventListener('mqtt:reconnecting',e=>record('reconnecting','reconnect scheduled'+(e.detail&&e.detail.attempt?' · attempt '+e.detail.attempt:'')));
 window.addEventListener('mqtt:connecting',()=>record('reconnecting','connection attempt started'));
 window.addEventListener('mqtt:error',e=>{const d=e.detail||{};if(d.connected||window.APP_STATE?.mqttConnected)return;record('disconnected','MQTT error: '+reason(d),reason(d));});
}
function inject(){
 if(document.querySelector('[data-mqtt-diagnostic-root]'))return;
 const panel=document.createElement('section'); panel.className='section card pad advanced-only'; panel.dataset.mqttDiagnosticRoot='';
 panel.style.cssText='border:1px solid rgba(24,130,74,.16);margin-top:16px';
 panel.innerHTML='<div class="section-head"><div><p class="kicker">MQTT CONNECTION DIAGNOSTIC</p><h2>วิเคราะห์การเชื่อมต่อ MQTT</h2><p class="helper" data-mqtt-diagnostic-detail>ไม่ได้เชื่อมต่อ</p></div><span class="tag" data-mqtt-diagnostic-state data-state="disconnected">Disconnected</span></div><div class="mqtt-diag-grid"><div><span>Connect ล่าสุด</span><strong data-mqtt-last-connected>—</strong></div><div><span>Disconnect ล่าสุด</span><strong data-mqtt-last-disconnected>—</strong></div><div><span>จำนวน Reconnect</span><strong data-mqtt-reconnect-count>0</strong></div><div><span>เหตุผลล่าสุด</span><strong data-mqtt-disconnect-reason>initial</strong></div></div><div class="mqtt-diag-error"><span>รายละเอียด Error</span><strong data-mqtt-last-error>ไม่มี error ล่าสุด</strong></div><h3>เหตุการณ์ล่าสุด</h3><div data-mqtt-diagnostic-history class="mqtt-diag-history"></div><p class="helper">ช่วยแยกว่าเหตุการณ์มาจาก Dashboard/UI หรือ broker/socket โดยไม่เปลี่ยน logic ของ ESP8266</p>';
 const target=document.querySelector('#systemHealthPanel')||document.querySelector('[data-mqtt-live-panel]')?.nextElementSibling;
 target?.parentNode?.insertBefore(panel,target);
 render();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{install();inject()});else{install();inject()}
window.MqttDiagnostic={getState:()=>({...S}),render};
})();