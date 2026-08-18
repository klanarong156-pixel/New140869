# Smart Farm Real-time MQTT over WebSocket

ระบบภายนอกสามารถรับข้อมูลจาก Smart Farm แบบ Real-time ได้โดยเชื่อมต่อ MQTT broker ผ่าน Secure WebSocket โดยตรง ไม่ต้องมี API server เพิ่มเติม และไม่ต้องเปิดพอร์ตเข้าหา ESP8266

## Connection

| รายการ | ค่า |
|---|---|
| Secure WebSocket URL | `wss://650188a0ee2b4367b7c131fb385590a9.s1.eu.hivemq.cloud:8884/mqtt` |
| Protocol | MQTT over WebSocket with TLS |
| MQTT base topic | `smartfarm` |
| Permission ที่ควรใช้ | Subscribe Only |
| QoS ที่ระบบปัจจุบันใช้ | QoS 0; retained status จะได้รับทันทีเมื่อ subscribe |

ให้สร้างบัญชี MQTT แยกสำหรับผู้รับข้อมูลภายนอกใน HiveMQ Cloud และกำหนดสิทธิ์แบบ Subscribe Only เฉพาะ topic สถานะ ห้ามใช้ username/password ของผู้ดูแลระบบหรือบัญชีที่มีสิทธิ์ Publish

## Read-only topics

| Topic | ข้อมูล | รูปแบบ |
|---|---|---|
| `smartfarm/relay/+/status` | สถานะรีเลย์ `pump`, `zone1`, `lighthome`, `lightsala` | `ON` หรือ `OFF`; retained |
| `smartfarm/sensor/dht11` | อุณหภูมิและความชื้น | JSON เช่น `{"temperature":30.2,"humidity":65.0}` |
| `smartfarm/status/online` | สถานะการเชื่อมต่ออุปกรณ์ | `true` หรือ `false`; retained/LWT |
| `smartfarm/device/status` | Heartbeat และข้อมูลอุปกรณ์ | JSON; ส่งเป็นระยะ |
| `smartfarm/mode/status` | โหมดการทำงาน | `AUTO` หรือ `MANUAL`; retained |
| `smartfarm/schedule/+/status` | ตารางเวลาของแต่ละรีเลย์ | JSON; retained |
| `smartfarm/config/telegram/status` | สถานะการตั้งค่า Telegram | JSON; ไม่ใช่ secret token |

บัญชีภายนอกควรได้รับอนุญาตเฉพาะ filter ด้านบน และไม่ควร subscribe `#` เพราะจะทำให้เห็น command topics รวมถึงข้อมูลที่ไม่จำเป็น

## JavaScript example

```html
<script src="https://unpkg.com/mqtt/dist/mqtt.min.js"></script>
<script>
  const client = mqtt.connect(
    'wss://650188a0ee2b4367b7c131fb385590a9.s1.eu.hivemq.cloud:8884/mqtt',
    {
      username: 'READ_ONLY_USERNAME',
      password: 'READ_ONLY_PASSWORD',
      clientId: `SmartFarmExternal-${crypto.randomUUID()}`,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
      keepalive: 30
    }
  );

  const readTopics = [
    'smartfarm/relay/+/status',
    'smartfarm/sensor/dht11',
    'smartfarm/status/online',
    'smartfarm/device/status',
    'smartfarm/mode/status',
    'smartfarm/schedule/+/status',
    'smartfarm/config/telegram/status'
  ];

  client.on('connect', () => {
    client.subscribe(readTopics, { qos: 0 }, error => {
      if (error) console.error('Subscribe failed:', error);
    });
  });

  client.on('message', (topic, payload) => {
    const text = payload.toString();
    try {
      console.log(topic, JSON.parse(text));
    } catch {
      console.log(topic, text);
    }
  });

  client.on('error', console.error);
</script>
```

## Security requirements

ใช้ `wss://` เท่านั้น ตรวจสอบว่า credential ของระบบภายนอกเป็นบัญชีอ่านอย่างเดียว และไม่ฝัง password ลงใน source code ที่เผยแพร่ต่อสาธารณะ สำหรับหน้าเว็บจริงให้กรอก credential ผ่าน secret manager หรือ session ที่ควบคุมสิทธิ์ได้ และหมุนรหัสผ่านทันทีหากเคย commit ลง repository

การเชื่อมต่อนี้เป็นการอ่านจาก broker โดยตรง ข้อมูล Real-time จะมาถึงผู้รับทันทีเมื่อ ESP8266 publish ข้อมูล ส่วนข้อมูลที่เป็น retained status จะถูกส่งให้ client เมื่อ subscribe เพื่อให้ระบบภายนอกเริ่มต้นด้วยสถานะล่าสุด

## Test page

เปิด `realtime-mqtt.html` ผ่าน HTTPS หรือ local web server กรอก WebSocket URL, username และ password ของบัญชี Subscribe Only แล้วกด Connect หน้าเว็บจะ subscribe เฉพาะ read-only topics และแสดง event ที่ได้รับแบบ Real-time โดยไม่บันทึก credential ลง localStorage

## References

1. [HiveMQ Cloud Quick Start Guide](https://docs.hivemq.com/hivemq-cloud/quick-start-guide.html)
2. [HiveMQ Cloud Authentication and Authorization](https://docs.hivemq.com/hivemq-cloud/authn-authz.html)
3. [HiveMQ MQTT over WebSockets](https://www.hivemq.com/blog/mqtt-over-websockets-with-hivemq/)
