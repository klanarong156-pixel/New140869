/* SmartFarm V6.2 MQTT core */
class MqttHandler {
  constructor(config){
    this.config=config; this.client=null; this.connecting=false; this.bootstrapped=false;
    this.setupShown=false; this.deviceTimer=null; this.pendingPublishes=[];
    this.storageUser='smartfarm.mqtt.username'; this.storagePass='smartfarm.mqtt.password';
    this.storageRemember='smartfarm.mqtt.remember'; this.lastConnectError='';
  }
  dispatch(name,detail){window.dispatchEvent(new CustomEvent(name,{detail}));}
  getCredentials(){
    const cu=String(this.config?.username||'').trim(), cp=String(this.config?.password||'');
    if(cu&&cp)return {username:cu,password:cp};
    return {username:localStorage.getItem(this.storageUser)||sessionStorage.getItem(this.storageUser)||'',password:localStorage.getItem(this.storagePass)||sessionStorage.getItem(this.storagePass)||''};
  }
  hasCredentials(){const c=this.getCredentials();return !!(c.username&&c.password);}
  setDeviceOnline(online,source='mqtt'){APP_STATE.espOnline=!!online;APP_STATE.espStatusSource=source;this.dispatch('esp:status',{online:!!online,source,lastSeen:APP_STATE.espLastSeen});}
  markDeviceSeen(source='heartbeat'){APP_STATE.espLastSeen=Date.now();this.setDeviceOnline(true,source);}
  startDeviceWatchdog(){clearInterval(this.deviceTimer);this.deviceTimer=setInterval(()=>{if(APP_STATE.espLastSeen&&Date.now()-APP_STATE.espLastSeen>this.config.deviceHeartbeatTimeoutMs)this.setDeviceOnline(false,'timeout');},5000);}
  connect(){
    if(typeof mqtt==='undefined'){this.dispatch('mqtt:error',new Error('MQTT library not loaded'));return false;}
    if(this.client?.connected||this.connecting)return true;
    const c=this.getCredentials(); if(!c.username||!c.password){this.dispatch('mqtt:credentials-required',{configured:false});return false;}
    this.connecting=true; this.dispatch('mqtt:connecting',true);
    this.client=mqtt.connect(this.config.url,{clientId:this.config.clientId,username:c.username,password:c.password,clean:true,reconnectPeriod:5000,connectTimeout:30000,keepalive:30});
    this.client.on('connect',()=>{this.connecting=false;APP_STATE.mqttConnected=true;this.dispatch('mqtt:connected',true);this.config.allowedSubscribeTopics.forEach(t=>this.client.subscribe(t,{qos:0}));this.startDeviceWatchdog();this.flushPending();});
    this.client.on('message',(t,m)=>this.handleMessage(t,m.toString()));
    this.client.on('close',()=>{this.connecting=false;APP_STATE.mqttConnected=false;this.dispatch('mqtt:connected',false);this.dispatch('mqtt:reconnecting',true);});
    this.client.on('reconnect',()=>{this.connecting=true;this.dispatch('mqtt:reconnecting',true);});
    this.client.on('error',e=>{this.connecting=false;this.lastConnectError=String(e?.message||e||'');this.dispatch('mqtt:error',e);});
    return true;
  }
  bootstrap(){if(this.bootstrapped)return;this.bootstrapped=true;this.startDeviceWatchdog();if(this.hasCredentials())this.connect();else this.dispatch('mqtt:credentials-required',{configured:false,initial:true});}
  flushPending(){if(!this.client?.connected)return;const q=this.pendingPublishes.splice(0);const now=Date.now();q.forEach(x=>{if(now-x.createdAt<=30000)this.client.publish(x.topic,x.payload,x.options);});}
  publish(topic,payload,options={}){if(!this.client?.connected){if(!this.hasCredentials())return false;this.pendingPublishes.push({topic,payload:String(payload),options,createdAt:Date.now()});this.connect();return true;}this.client.publish(topic,String(payload),options);return true;}
  handleMessage(topic,payload){
    const s=String(payload).trim();
    if(topic.startsWith('smartfarm/relay/')&&topic.endsWith('/status')){const relay=topic.split('/')[2],v=s.toUpperCase();if(RELAYS.includes(relay)&&['ON','OFF'].includes(v)){APP_STATE.relays[relay]=v==='ON';this.markDeviceSeen('relay-status');this.dispatch('relay:status',{relay,status:v==='ON'});}return;}
    if(topic===this.config.topics.online){if(['true','online','1','yes'].includes(s.toLowerCase()))this.markDeviceSeen('presence');else this.setDeviceOnline(false,'last-will');return;}
    if(topic===this.config.topics.deviceStatus){try{const d=JSON.parse(s);if(d.online===true)this.markDeviceSeen('device-status');if(d.online===false)this.setDeviceOnline(false,'device-status');this.dispatch('device:data',d);}catch(e){}return;}
    if(topic===this.config.topics.modeStatus){const mode=s.toUpperCase();if(['MANUAL','AUTO'].includes(mode)){APP_STATE.mode=mode.toLowerCase();this.markDeviceSeen('mode-status');this.dispatch('mode:status',mode);}return;}
    if(topic===this.config.topics.sensor('dht11')){try{const d=JSON.parse(s);this.markDeviceSeen('dht11');if(Number.isFinite(Number(d.temperature)))this.dispatch('sensor:data',{type:'temperature',value:Number(d.temperature)});if(Number.isFinite(Number(d.humidity)))this.dispatch('sensor:data',{type:'humidity',value:Number(d.humidity)});}catch(e){}}
  }
}
window.mqttHandler=new MqttHandler(MQTT_CONFIG);
