/* SmartFarm V6.2 UI bridge
 * Single responsibility: render MQTT/device events and send UI commands.
 */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const text=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
  const cfg=()=>window.MQTT_CONFIG;

  window.SF=window.SF||{version:'6.2',sensors:{temperature:null,humidity:null},lastSeen:0,espOnline:false};

  function renderDeviceStatus(online){
    SF.espOnline=!!online;
    text('heroEsp',online?'ออนไลน์':'ออฟไลน์');
    text('deviceStatus',online?'ESP8266 ออนไลน์':'ESP8266 ออฟไลน์');
    text('deviceStatusCard',online?'ออนไลน์':'ออฟไลน์');
    const el=$('deviceStatus');if(el)el.classList.toggle('online',!!online);
  }

  window.addEventListener('relay:status',e=>{
    const d=e.detail||{};if(!d.relay)return;
    if(window.APP_STATE?.relays)APP_STATE.relays[d.relay]=!!d.status;
    const toggle=$(d.relay+'Toggle');if(toggle)toggle.checked=!!d.status;
    text('state-'+d.relay,d.status?'เปิด':'ปิด');
    text(d.relay+'StatusText',d.status?'กำลังทำงาน':'ปิด');
  });

  window.addEventListener('sensor:data',e=>{
    const d=e.detail||{},v=Number(d.value);if(!Number.isFinite(v))return;
    if(d.type==='temperature'){SF.sensors.temperature=v;text('temperature',v.toFixed(1)+' °C');}
    else if(d.type==='humidity'){SF.sensors.humidity=v;text('humidity',v.toFixed(1)+' %');}
  });

  window.addEventListener('esp:status',e=>{
    const d=e.detail||{},online=!!d.online;
    if(d.lastSeen)SF.lastSeen=d.lastSeen;else if(online)SF.lastSeen=Date.now();
    renderDeviceStatus(online);
  });

  window.addEventListener('device:data',e=>{
    const d=e.detail||{};
    if(d.online===true){SF.lastSeen=Date.now();renderDeviceStatus(true);}
    if(d.online===false)renderDeviceStatus(false);
    text('deviceFirmware',d.firmware||'V6.2-PRODUCTION-RTC');
    if(Number.isFinite(Number(d.rssi)))text('deviceRssi',Number(d.rssi)+' dBm');
  });

  window.addEventListener('mqtt:connected',e=>{
    const connected=!!e.detail;
    text('mqttStatus',connected?'MQTT เชื่อมต่อ':'MQTT ออฟไลน์');
    text('mqttState',connected?'MQTT เชื่อมต่อ':'MQTT ออฟไลน์');
    const el=$('mqttStatus');if(el)el.classList.toggle('online',connected);
    const state=$('mqttState');if(state)state.classList.toggle('online',connected);
  });

  window.addEventListener('mqtt:connecting',()=>{text('mqttStatus','MQTT กำลังเชื่อมต่อ');text('mqttState','MQTT กำลังเชื่อมต่อ');});
  window.addEventListener('mqtt:reconnecting',()=>{text('mqttStatus','MQTT กำลังเชื่อมต่อใหม่');text('mqttState','MQTT กำลังเชื่อมต่อใหม่');});
  window.addEventListener('mqtt:error',()=>text('mqttStatus','MQTT มีปัญหา'));

  window.addEventListener('mode:status',e=>{
    const mode=String(e.detail||'MANUAL').toUpperCase();
    text('heroMode',mode);text('modeCard',mode);text('modeCard2',mode);
    if(window.APP_STATE)APP_STATE.mode=mode.toLowerCase();
  });

  function publish(topic,payload,options={}){
    if(!window.mqttHandler||!cfg()?.topics)return false;
    return window.mqttHandler.publish(topic,payload,options);
  }

  function commandRelay(relay,on){
    return publish(cfg().topics.relaySet(relay),on?'ON':'OFF');
  }

  function bindRelay(id,relay){
    const input=$(id);if(!input||input.__sfBound)return;input.__sfBound=true;
    input.addEventListener('change',()=>{
      const wanted=!!input.checked;
      const ok=commandRelay(relay,wanted);
      if(!ok)input.checked=!wanted;
      else window.showToast?.(`${relay==='pump'?'ปั๊มน้ำ':relay==='zone1'?'โซน 1':relay==='lighthome'?'ไฟบ้าน':'ไฟศาลา'}: ${wanted?'สั่งเปิด':'สั่งปิด'} แล้ว`,'success');
    });
  }

  window.setFarmMode=function(mode){
    mode=String(mode||'').toUpperCase();
    if(mode!=='AUTO'&&mode!=='MANUAL')return false;
    const ok=publish(cfg().topics.modeSet,mode,{retain:true});
    if(ok){APP_STATE.mode=mode.toLowerCase();window.showToast?.(mode==='AUTO'?'เปลี่ยนเป็น AUTO แล้ว':'เปลี่ยนเป็น MANUAL แล้ว','success');}
    return ok;
  };

  document.addEventListener('DOMContentLoaded',()=>{
    bindRelay('pumpToggle','pump');
    bindRelay('zone1Toggle','zone1');
    bindRelay('lighthomeToggle','lighthome');
    bindRelay('lightsalaToggle','lightsala');
  });
})();
