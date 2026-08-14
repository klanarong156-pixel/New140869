// Smart Farm V7 runtime configuration
const MQTT_CONFIG = Object.freeze({
  url:"wss://650188a0ee2b4367b7c131fb385590a9.s1.eu.hivemq.cloud:8884/mqtt",
  username:"smartfarm",
  password:"Kla12345",
  clientId:"SmartFarmWeb-"+Math.random().toString(16).slice(2),
  topics:{relaySet:r=>`smartfarm/relay/${r}/set`,relayStatus:r=>`smartfarm/relay/${r}/status`,sensor:t=>`smartfarm/sensor/${t}`,modeSet:"smartfarm/mode/set",modeStatus:"smartfarm/mode/status",scheduleSet:r=>`smartfarm/schedule/${r}/set`,scheduleStatus:r=>`smartfarm/schedule/${r}/status`,online:"smartfarm/status/online",deviceStatus:"smartfarm/device/status"},
  allowedSubscribeTopics:["smartfarm/relay/+/status","smartfarm/sensor/dht11","smartfarm/status/online","smartfarm/device/status","smartfarm/mode/status","smartfarm/schedule/+/status"],
  deviceHeartbeatTimeoutMs:25000
});
window.MQTT_CONFIG=MQTT_CONFIG;
const HARDWARE_PINS=Object.freeze({DHT11_DATA:"D0",RTC_SDA:"D2",RTC_SCL:"D1",PUMP:"D5",ZONE1:"D6",HOME_LIGHT:"D7",SALA_LIGHT:"D8",SOIL_SENSOR:"A0"});
window.HARDWARE_PINS=HARDWARE_PINS;
const RELAYS=["pump","zone1","lighthome","lightsala"];
const RELAY_NAMES={pump:"ปั๊มน้ำ",zone1:"โซน 1",lighthome:"ไฟบ้าน",lightsala:"ไฟศาลา"};
const APP_STATE={mqttConnected:false,espOnline:false,espLastSeen:0,espStatusSource:'none',mode:"manual",relays:{pump:false,zone1:false,lighthome:false,lightsala:false}};
window.APP_STATE=APP_STATE;