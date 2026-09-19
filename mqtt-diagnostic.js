(function(){
'use strict';
const S={state:'disconnected',lastConnectedAt:0,lastDisconnectedAt:0,reconnectCount:0,lastReason:'initial',lastError:'',history:[]};
const fmt=t=>t?new Intl.DateTimeFormat('th-TH',{dateStyle:'short',timeStyle:'medium'}).format(new Date(t)):'—';
function render(){
 const label=S.state==='connected'?'Connected':S.state==='reconnecting'?'Reconnecting':'Disconnected';
 document.querySelectorAll('[data-mqtt-diagnostic-state]').forEach(e=>{e.textContent=label;e.dataset.state=S.state});
 const m={'[data-mqtt-last-connected]':fmt(S.lastConnectedAt),'[data-mqtt-last-disconnected]':fmt(S.lastDisconnectedAt),'[data-mqtt-reconnect-count]':S.reconnectCount,'[data-mqtt-disconnect-reason]':S.lastReason||'—','[data-mqtt-last-error]':S.lastError||'ไม่มี error ล่าสุด'};
 Object.entries(m).forEach(([q,v])=>document.querySelectorAll(q).forEach(e=>e.textContent=v));
 document.querySelectorAll('[data-mqtt-diagnostic-detail]').forEach(e=>e.textContent=S.state==='connected'?'เชื่อมต่อกับ broker แล้ว':S.state==='reconnecting'?'กำลังเชื่อมต่อใหม่':'ไม่ได้เชื่อมต่อ');
 const h=document.querySelector('[data-mqtt-diagnostic-history]'); if(!h)return;
 h.replaceChildren(...S.history.slice(-5).reverse().map(x=>{const r=document.createElement('div');r.className='mqtt-diagnostic-history-row';const t=document.createElement('time'),b=document.createElement('strong'),s=document.createElement('span');t.textContent=fmt(x.timestamp);b.textContent=x.state==='connected'?'Connected':x.state==='reconnecting'?'Reconnecting':'Disconnected';s.textContent=x.reason||'—';r.append(t,b,s);return r;}));
}
window.addEventListener('mqtt:diagnostic',e=>{const d=e.detail||{};S.state=d.state||S.state;S.lastConnectedAt=Number(d.lastConnectedAt)||S.lastConnectedAt;S.lastDisconnectedAt=Number(d.lastDisconnectedAt)||S.lastDisconnectedAt;S.reconnectCount=Number(d.reconnectCount)||S.reconnectCount;S.lastReason=d.lastReason||S.lastReason;S.lastError=d.lastError||S.lastError;S.history.push({state:S.state,timestamp:Number(d.timestamp)||Date.now(),reason:S.lastReason});S.history=S.history.slice(-20);render();});
window.MqttDiagnostic={getState:()=>({...S}),render};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render);else render();
})();