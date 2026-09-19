# แนวทางแก้ไขความปลอดภัยข้อ 1–4

เอกสารนี้อธิบายแพตช์ที่เพิ่มใน revision ปัจจุบันและสิ่งที่ต้องตั้งค่าภายนอก source code ก่อนนำไปใช้งานจริง

## สรุปสิ่งที่แก้ใน source

| ข้อ | การแก้ใน source |
| --- | --- |
| 1. MQTT TLS | เพิ่ม `MQTT_ROOT_CA_PEM`, ติดตั้ง `BearSSL::X509List`, ลบ `setInsecure()` จาก MQTT path และทำให้ firmware ไม่เชื่อมต่อจนกว่าจะมี CA |
| 2. OTA | ปิด HTTP OTA ด้วย `ENABLE_INSECURE_HTTP_OTA 0`, ปิด standalone uploader และให้ dashboard รับเฉพาะ HTTPS gateway/VPN |
| 3. MQTT credential/ACL | เปลี่ยน browser เป็น session storage เท่านั้น, ล้างค่า MQTT legacy จาก localStorage, จำกัด browser subscription เป็น status/read topics และ firmware subscription เป็น command topics ที่ระบุชัด |
| 4. Admin readiness | เลื่อน MQTT bootstrap บนหน้า admin จน `access:ready` และให้ OTA/Telegram bind event เฉพาะ role `admin` |

## ข้อ 1: ติดตั้ง CA certificate ให้ MQTT

ใน `SmartFarm_V6_PRODUCTION1.ino` ให้แทนที่ข้อความภายใน `MQTT_ROOT_CA_PEM` ด้วย **Root CA ที่ถูกต้องสำหรับ certificate chain ของ HiveMQ Cloud cluster ที่ใช้งานจริง** ห้ามคัดลอก leaf certificate ที่หมดอายุเร็วมาใช้แทน Root CA และห้ามใส่ private key

ตัวอย่างโครงสร้างที่ต้องได้มีลักษณะดังนี้ แต่ต้องใช้ certificate จริงของ cluster:

```cpp
static const char MQTT_ROOT_CA_PEM[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
...root CA certificate...
-----END CERTIFICATE-----
)EOF";
```

ก่อนใส่ลง firmware ให้ตรวจ certificate chain และชื่อ host จากเครื่องที่เชื่อถือได้ เช่น:

```bash
openssl s_client \
  -connect 25305924f68c41f2a1e089a1836d3287.s1.eu.hivemq.cloud:8883 \
  -servername 25305924f68c41f2a1e089a1836d3287.s1.eu.hivemq.cloud \
  -showcerts </dev/null
```

จากนั้นตรวจว่า certificate ที่เลือกมี issuer chain ที่ตรงกับ server และยังไม่หมดอายุ ห้ามนำ output ทั้งชุดไปฝังโดยไม่ตรวจว่าเป็น root/anchor ที่เหมาะสม การตรวจจะขึ้นกับ chain ที่ broker ส่งและ policy ของ provider

โค้ดใหม่จะทำงานแบบ **fail-closed** หากยังใช้ placeholder หรือ CA ไม่ครบ:

```text
MQTT TLS: disabled - install the broker CA certificate first
```

การเชื่อมต่อจะไม่เกิดขึ้นจนกว่าจะติดตั้ง CA ดังนั้นต้องทดสอบบนอุปกรณ์สำรองก่อน deploy ภาคสนาม นาฬิกา RTC/NTP ต้องถูกตั้งค่าก่อน TLS handshake เพราะ BearSSL ใช้เวลาปัจจุบันในการตรวจอายุ certificate

ควรเพิ่ม acceptance test ดังนี้:

1. CA ถูกต้องและ host ถูกต้อง: เชื่อมต่อสำเร็จ
2. CA ผิด: handshake ล้มเหลว
3. broker certificate หมดอายุหรือชื่อ host ไม่ตรง: handshake ล้มเหลว
4. source ไม่มี `tls.setInsecure()` ใน MQTT path

## ข้อ 2: OTA ที่ปลอดภัย

แพตช์ปิด HTTP OTA โดยตั้งค่า:

```cpp
#define ENABLE_INSECURE_HTTP_OTA 0
```

และไม่เรียก `setupOtaHttpServer()` เมื่อค่าเป็นศูนย์ เนื่องจาก endpoint เดิมส่ง `Authorization: Basic ...` ผ่าน HTTP ซึ่งไม่ควรเปิดใช้งานแม้จะอยู่ใน LAN ก็ตาม หน้า `ota-standalone.html` จึงถูกเปลี่ยนเป็นหน้าแจ้งนโยบายและไม่ส่ง request ใด ๆ

ทางเลือกที่แนะนำมี 3 แบบ:

### ทางเลือก A: ใช้ HTTPS gateway/VPN

วาง gateway ที่รองรับ HTTPS ไว้ในเครือข่ายเดียวกับ ESP8266 แล้วให้ gateway ทำหน้าที่ตรวจสอบ:

- Firebase/admin identity
- allowlist ของ device IP หรือ device ID
- firmware signature/checksum
- rate limit และ audit log
- timeout และ post-reboot health check

Dashboard รุ่นใหม่รับเฉพาะ URL ที่ขึ้นต้นด้วย `https://` และเก็บ URL ไว้ใน `sessionStorage` เท่านั้น ตัว gateway จึงต้องเป็นผู้รับคำขอ `/api/status` และ `/update` แล้ว forward ไปยังอุปกรณ์ผ่านช่องทางภายในที่ควบคุมได้

### ทางเลือก B: ใช้ ArduinoOTA บน trusted management LAN

ArduinoOTA ยังไม่ใช่การแทน HTTPS gateway ที่สมบูรณ์ แต่เหมาะกับเครือข่าย management ที่แยกออกจาก guest/user Wi-Fi ต้องตั้ง password ที่แข็งแรง, ปิดการค้นพบจากเครือข่ายทั่วไป, จำกัด firewall/VLAN และไม่ port-forward ออกอินเทอร์เน็ต

### ทางเลือก C: ใช้ USB recovery

ควรเก็บขั้นตอน USB flash และ firmware รุ่นสุดท้ายที่ตรวจ checksum ไว้เป็น recovery path เสมอ โดยเฉพาะเมื่อปิด HTTP OTA แล้ว

ระยะยาวควรเพิ่ม firmware signing และให้ bootloader/อุปกรณ์ตรวจลายเซ็นก่อนบูต เพราะการตรวจเพียง HTTP status `2xx` ไม่ได้ยืนยันว่าอุปกรณ์บูต firmware ใหม่สำเร็จ

## ข้อ 3: MQTT credential และ ACL

### Browser storage

โค้ดใหม่ใช้ `sessionStorage` เท่านั้นและล้างค่า legacy ต่อไปนี้จาก `localStorage` เมื่อโหลด handler:

```text
smartfarm.mqtt.username
smartfarm.mqtt.password
smartfarm.mqtt.remember
```

การล้างนี้ไม่สามารถเรียกคืนความลับที่เคยถูกขโมยไปแล้วได้ หากรหัสผ่านเคยถูกใช้ใน production หรือเคย commit ลง repository ให้ rotate ที่ HiveMQ ก่อน deploy แพตช์

### Broker ACL ที่ควรตั้ง

อย่าใช้บัญชีเดียวสำหรับ device และ browser ใน production ควรมีอย่างน้อย 3 identity:

| Identity | Subscribe | Publish |
| --- | --- | --- |
| `smartfarm-device-{id}` | `smartfarm/relay/+/set`, `smartfarm/schedule/+/set`, `smartfarm/mode/set`, `smartfarm/emergency/set`, `smartfarm/config/telegram/set`, `smartfarm/config/telegram/test`, `smartfarm/reminder/set`, `smartfarm/ai/alert/set` | `smartfarm/relay/+/status`, `smartfarm/sensor/+`, `smartfarm/schedule/+/status`, `smartfarm/status/+`, `smartfarm/mode/status`, `smartfarm/time`, `smartfarm/system/error`, `smartfarm/config/telegram/status`, `smartfarm/reminder/status`, `smartfarm/ai/alert/status`, `smartfarm/emergency/status` |
| `smartfarm-dashboard-{farm}` | เฉพาะ status/read topics ในคอลัมน์ขวา | เฉพาะ command topics ที่จำเป็นต่อฟาร์มนั้น |
| `smartfarm-viewer-{farm}` | เฉพาะ status/read topics | ไม่มี |

ชื่อ syntax ของ ACL ต้องแปลงตามเมนู/รูปแบบของ HiveMQ Cloud ที่ใช้งานจริง ไม่ควร copy ตารางนี้ไปวางเป็น policy โดยไม่ตรวจว่า wildcard `+` และสิทธิ์ publish/subscribe ถูกตีความตาม provider อย่างไร

### Topic changes ใน firmware/browser

Firmware ไม่ subscribe `smartfarm/#` แล้ว แต่ subscribe เฉพาะ command topics 8 กลุ่ม ส่วน browser ไม่ subscribe command topics และรับเฉพาะ status/read topics การจำกัดนี้ลดผลกระทบหาก browser credential ถูกขโมย แต่ไม่ได้แทนที่ broker ACL เพราะ client ที่ถูกแก้ไขยังสามารถพยายาม publish topic อื่นได้

ควรทดสอบ broker ด้วย identity แต่ละแบบ:

```text
viewer: subscribe status = pass; publish relay command = deny
browser: subscribe status = pass; subscribe command = deny; publish approved command = pass
other-farm browser: read/write farm A topic = deny
old/revoked password: connect = deny
```

## ข้อ 4: Admin readiness และ authorization boundary

หน้า Settings, OTA และ Telegram ถูกปรับให้รอ `access:ready` และตรวจ `role === 'admin'` ก่อน bind handler ที่มี side effect นอกจากนี้ app จะไม่ bootstrap MQTT บนหน้า `data-admin-required="true"` จนกว่าจะยืนยัน admin สำเร็จ

สิ่งนี้แก้ race condition และลดการเปิด action โดยไม่จำเป็น แต่ **ยังไม่ใช่ authorization boundary เพียงชั้นเดียว** เพราะ JavaScript ใน browser ถูกแก้ไขได้ ผู้ให้บริการต้องบังคับสิทธิ์ซ้ำที่:

- broker ACL สำหรับ MQTT command
- HTTPS OTA gateway สำหรับ firmware update
- Firebase Rules/Cloud Functions สำหรับข้อมูลและ admin operation
- network ACL/VLAN สำหรับ management LAN

หาก user ไม่ใช่ admin, `access.js` ยังอาจ dispatch `access:ready` พร้อม role `user` ก่อน redirect ตาม design เดิม แต่ OTA/Telegram จะไม่ bind และ app จะไม่ bootstrap MQTT บนหน้า admin การทดสอบต้องยืนยันทั้งกรณี role user และกรณี role lookup ล้มเหลว ซึ่งต้อง fail closed เป็น user

## ขั้นตอน deploy ที่แนะนำ

1. Rotate MQTT และ OTA credentials หากมีโอกาสเคยเปิดเผย
2. ตั้ง broker ACL แยก device/dashboard/viewer ก่อน flash firmware
3. ใส่ Root CA ที่ตรวจสอบแล้วลง firmware และ build บนอุปกรณ์ทดสอบ
4. ทดสอบ TLS ผิด/ถูก, relay command, heartbeat และ schedule บนอุปกรณ์ทดสอบ
5. ปิด HTTP OTA และเตรียม HTTPS gateway หรือ USB recovery
6. Deploy JavaScript แล้วล้าง localStorage legacy ใน browser ที่เคยใช้ระบบ
7. ทดสอบ role user/admin ด้วย session หมดอายุและ role lookup timeout
8. ตรวจ audit log และ post-reboot status หลัง OTA ทุกครั้ง

## ข้อจำกัดของแพตช์นี้

แพตช์นี้ยังไม่สร้าง HTTPS gateway ให้โดยอัตโนมัติ เพราะ gateway ต้องเลือกตาม topology ของเครือข่ายและอุปกรณ์ที่ใช้งานจริง อีกทั้งยังไม่ได้เพิ่ม firmware signature verification, certificate rotation mechanism หรือ broker ACL ผ่าน API provider แทนผู้ดูแลระบบ การนำไปใช้จริงต้องทำสามส่วนนี้ให้เสร็จใน deployment environment ก่อนเปิดใช้งานภาคสนาม
