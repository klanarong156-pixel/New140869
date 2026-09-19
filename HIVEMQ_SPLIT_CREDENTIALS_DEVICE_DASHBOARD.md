# ขั้นตอนแยก HiveMQ Credential ระหว่าง Device และ Dashboard

คู่มือนี้ใช้สำหรับแยก credential ของ Smart Farm ออกจากกันเป็น 2 บัญชี:

```text
Device credential    → ESP8266
Dashboard credential → เว็บไซต์ Smart Farm
```

การแยกนี้ช่วยให้สามารถปิดหรือเปลี่ยนรหัสผ่าน Dashboard โดยไม่ทำให้ ESP8266 หยุดส่งข้อมูล และช่วยลดผลกระทบหาก password ของ browser ถูกเปิดเผย

> ขั้นตอนนี้แยก **ตัวตนของ client** ก่อน ยังไม่ใช่การจำกัด topic แบบละเอียด หาก HiveMQ ยังใช้ permission กว้าง เช่น `Publish and Subscribe` กับ `#` ทั้งสองบัญชีจะยังมีสิทธิ์กว้างอยู่ แต่จะสามารถ revoke และตรวจสอบแยกกันได้

## ภาพรวมการทำงานหลังแยก

| ส่วน | Username ใหม่ | เก็บ credential ที่ไหน | หน้าที่ |
| --- | --- | --- | --- |
| ESP8266 | `smartfarm-device-01` | configuration ของ ESP8266 ใน flash | รับคำสั่งและ publish heartbeat/sensor/status |
| Dashboard | `smartfarm-dashboard-01` | `sessionStorage` ของ browser ตาม patch ปัจจุบัน | อ่าน status และส่งคำสั่งจากหน้าเว็บ |

ห้ามใช้ username/password ชุดเดียวกันกับทั้งสองส่วน

---

## ขั้นที่ 0: เตรียมข้อมูลก่อนเริ่ม

เตรียมข้อมูลต่อไปนี้:

1. สิทธิ์เข้าสู่ HiveMQ Cloud Console
2. ชื่อ cluster ที่ Smart Farm ใช้งาน
3. IP หรือ hostname ของ ESP8266
4. คอมพิวเตอร์หรือโทรศัพท์ที่อยู่ Wi-Fi เดียวกับ ESP8266 สำหรับตั้งค่า Device
5. password manager สำหรับเก็บ credential ใหม่
6. วิธี recovery ผ่าน USB ในกรณี ESP8266 เชื่อม MQTT ไม่ได้

อย่าบันทึก password ลงใน:

- GitHub
- `config.js`
- HTML
- README ที่เป็น public
- screenshot
- chat หรือ issue ที่เปิดเผยต่อสาธารณะ

แนะนำให้สร้าง password แบบสุ่มอย่างน้อย 24 ตัวอักษร และใช้คนละ password ระหว่าง Device กับ Dashboard

---

## ขั้นที่ 1: ตรวจสถานะเดิมและหยุดการเปลี่ยนแปลงชั่วคราว

ก่อนสร้าง credential ใหม่ ให้จดข้อมูล credential เดิมไว้ใน password manager แต่ไม่ต้องนำ password ไปใส่ในเอกสารหรือ commit

ตรวจว่าระบบปัจจุบันยังทำงานได้:

- Dashboard เห็น MQTT connected
- Dashboard เห็น heartbeat จาก ESP8266
- ค่า sensor อัปเดต
- สถานะ relay แสดงถูกต้อง
- schedule ยังทำงานบน ESP8266

ช่วงเปลี่ยน credential อย่าอัปเดต firmware และอย่าเปลี่ยน topic contract พร้อมกัน เพราะจะทำให้แยกสาเหตุของปัญหาได้ยาก

---

## ขั้นที่ 2: สร้าง Device credential ใน HiveMQ

1. เข้า **HiveMQ Cloud Console**
2. เลือก cluster ที่ Smart Farm ใช้
3. กด **Manage Cluster**
4. เปิดแท็บ **Access Management**
5. ตรวจว่า authentication ใช้ **Access Credentials / Username and Password**
6. ไปที่ส่วน **Access Credentials**
7. กด **Add Credentials** หรือปุ่มที่มีความหมายเทียบเท่า
8. ตั้งค่าดังนี้:

```text
Username:
smartfarm-device-01

Password:
สร้าง password ใหม่แบบสุ่ม

Permission/Role:
ใช้ permission เดิมชั่วคราวเพื่อให้เปลี่ยนผ่านได้ก่อน
```

หากใช้ HiveMQ Starter และสร้าง role ไว้แล้ว ให้เลือก role สำหรับ Device เช่น:

```text
smartfarm-device-role
```

หากยังไม่ได้สร้าง role และกำลังทำเฉพาะการแยก credential ให้เลือก permission เดิมที่ระบบใช้งานอยู่ก่อน แล้วค่อยลด ACL ในขั้นตอนถัดไป

9. กด **Save/Create**
10. เก็บ username/password ลง password manager โดยตั้งชื่อรายการ เช่น:

```text
HiveMQ / SmartFarm / Device / ESP8266-01
```

อย่าเพิ่งลบ credential เดิม เพราะ ESP8266 และ Dashboard ยังอาจใช้งานอยู่

### ข้อควรระวัง

HiveMQ อาจ cache การเปลี่ยนแปลง credential ชั่วคราว และ client ที่เชื่อมต่ออยู่แล้วอาจยังทำงานจนกว่าจะ reconnect ดังนั้นต้องทดสอบ credential ใหม่ก่อน revoke ของเดิม

---

## ขั้นที่ 3: เปลี่ยน credential ของ ESP8266

ESP8266 เก็บ MQTT username/password ใน configuration ของอุปกรณ์ ไม่ได้อ่านจาก `config.js` ของ Dashboard

### วิธีตั้งค่าผ่าน SmartFarm_Setup

1. อยู่ใน Wi-Fi เดียวกับ ESP8266
2. กดปุ่ม Wi-Fi reset/configuration ตามขั้นตอนของบอร์ด หรือเปิด portal `SmartFarm_Setup`
3. เปิดหน้า configuration ของ ESP8266
4. กรอก:

```text
MQTT username:
smartfarm-device-01

MQTT password:
password ของ Device credential
```

5. ตรวจว่า `ota_pass` ยังมีค่าอยู่
6. อย่าแก้ Telegram หรือค่าอื่นถ้าไม่จำเป็น
7. กด Save/Apply
8. รอ ESP8266 reconnect Wi-Fi และ MQTT

### ตรวจจาก Serial Monitor

ควรเห็นข้อความลักษณะนี้:

```text
MQTT: Connecting to <broker-host>:8883
MQTT: Client ID=<device-client-id> username=smartfarm
MQTT: Connected
MQTT: READY
```

ค่า `username=smartfarm` ในข้อความ diagnostic เดิมอาจเป็นเพียง label ว่าเป็น recommended username ไม่ใช่หลักฐานว่าใช้ username เก่าจริง ให้ตรวจจากค่าใน portal และ HiveMQ Console เป็นหลัก

ไม่ควรเห็น:

```text
MQTT ERROR: bad credentials
MQTT ERROR: unauthorized
MQTT CONFIG: MISSING username/password
```

### ตรวจใน HiveMQ Console

เปิด metrics หรือ client connection list แล้วตรวจว่า client ใหม่เชื่อมด้วย:

```text
Username: smartfarm-device-01
Client ID: SmartFarm-ESP8266-<chip-id>
```

Client ID อาจแตกต่างตาม `deviceName` และ chip ID แต่ username ต้องเป็น Device credential ใหม่

---

## ขั้นที่ 4: ทดสอบ Device ก่อนเปลี่ยน Dashboard

ในช่วงนี้ Dashboard อาจยังใช้ credential เดิม แต่ต้องตรวจว่า ESP8266 เชื่อมด้วย Device credential แล้ว

ตรวจผลดังนี้:

| รายการ | ผลที่ควรได้ |
| --- | --- |
| ESP8266 connect | สำเร็จ |
| Heartbeat | เข้ามาทุกประมาณ 10 วินาที |
| Sensor | อัปเดตได้ |
| Relay status | publish ได้ |
| Schedule status | publish ได้ |
| MQTT command จาก Dashboard เดิม | ยังทำงานได้ชั่วคราว หาก ACL เดิมอนุญาต |

ถ้า ESP8266 connect ไม่ได้:

1. อย่าเพิ่งลบ credential เดิม
2. ตรวจ username/password ทีละตัวอักษร
3. ตรวจว่าเลือก cluster ถูกตัว
4. ตรวจว่า credential มี permission ที่อนุญาตให้ connect
5. ตรวจ CA/TLS หากใช้ firmware hardened แล้ว
6. ถ้าจำเป็นให้คืนค่า credential เดิมผ่าน `SmartFarm_Setup`

---

## ขั้นที่ 5: เตรียม Dashboard credential

1. กลับไปที่ HiveMQ Cloud Console
2. ไปที่ **Access Management → Access Credentials**
3. กด **Add Credentials**
4. ตั้งค่า:

```text
Username:
smartfarm-dashboard-01

Password:
สร้าง password ใหม่และต้องไม่ซ้ำกับ Device

Permission/Role:
ใช้ permission เดิมชั่วคราว หรือเลือก smartfarm-dashboard-role ถ้าสร้างไว้แล้ว
```

5. กด Save/Create
6. เก็บใน password manager:

```text
HiveMQ / SmartFarm / Dashboard / Web-01
```

ไม่ต้องใส่ username/password นี้ใน `config.js` เพราะ source ควรให้ผู้ใช้กรอกผ่าน MQTT setup modal

### ค่า default username ในหน้าเว็บ

ใน source ปัจจุบัน `config.js` อาจมีค่า:

```js
defaultUsername: 'smartfarm'
```

ค่านี้เป็นเพียงค่าเริ่มต้นในช่องกรอก ไม่ใช่ credential ที่ฝังอยู่ใน source ผู้ใช้ต้องกรอก username ใหม่เป็น:

```text
smartfarm-dashboard-01
```

ถ้าต้องการลดความสับสน สามารถเปลี่ยน default เป็นชื่อ Dashboard ได้ภายหลัง แต่ไม่จำเป็นต่อการแยก credential

---

## ขั้นที่ 6: ล้าง credential Dashboard เดิมจาก browser

เปิด Dashboard ที่ใช้งาน แล้วเปิด DevTools Console จาก origin เดียวกับเว็บ จากนั้นรัน:

```js
localStorage.removeItem('smartfarm.mqtt.username');
localStorage.removeItem('smartfarm.mqtt.password');
localStorage.removeItem('smartfarm.mqtt.remember');
sessionStorage.removeItem('smartfarm.mqtt.username');
sessionStorage.removeItem('smartfarm.mqtt.password');
```

ถ้าใช้ patch ล่าสุด ตัว `mqtt-handler.js` จะล้างค่า MQTT legacy ใน `localStorage` ให้อัตโนมัติด้วย แต่การล้างเองช่วยให้แน่ใจว่าไม่มีค่าเดิมค้างอยู่

จากนั้น:

1. Reload หน้าเว็บ
2. เปิด **ตั้งค่า MQTT**
3. กรอก:

```text
MQTT username:
smartfarm-dashboard-01

MQTT password:
password ของ Dashboard credential
```

4. กด **บันทึกและเชื่อมต่อ**
5. ยืนยันว่า browser ใช้ session-only storage
6. ปิด tab แล้วเปิดใหม่เพื่อยืนยันว่าระบบไม่เติม password อัตโนมัติ

---

## ขั้นที่ 7: ตรวจว่า Dashboard เชื่อมด้วยบัญชีใหม่

ใน HiveMQ Console ให้ตรวจ client connection list:

```text
Username: smartfarm-dashboard-01
```

ต้องไม่ใช่:

```text
smartfarm-device-01
```

จาก Dashboard ตรวจ:

- MQTT status เป็น connected
- เห็น `smartfarm/status/device`
- เห็น sensor data
- เห็น relay status
- กด relay แล้ว ESP8266 รับคำสั่ง
- Emergency Stop และ reset ทำงานตามสิทธิ์ที่ตั้งไว้
- Telegram/reminder ทำงานถ้า permission รองรับ

หาก Dashboard แสดง connected แต่ข้อมูลไม่มา ให้ตรวจ subscribe permission และ topic filter ใน HiveMQ ก่อน ไม่ควรรีบเปลี่ยน source code

---

## ขั้นที่ 8: ทดสอบว่า credential ไม่ปะปนกัน

ทดสอบด้วย MQTTX หรือ MQTT Explorer โดยใช้ credential แต่ละชุด

### ทดสอบ Device credential

ตั้ง connection เป็น:

```text
Username: smartfarm-device-01
Password: Device password
Host: broker host เดิม
Port: 8883 หรือ WSS port ตาม client
TLS: เปิด
```

คาดหวัง:

```text
Device connect                 PASS
Device publish status          PASS
Device publish sensor          PASS
Device subscribe command       PASS เมื่อ firmware ใช้งาน
Device ใช้ Dashboard password  FAIL
```

### ทดสอบ Dashboard credential

```text
Username: smartfarm-dashboard-01
Password: Dashboard password
```

คาดหวัง:

```text
Dashboard connect              PASS
Dashboard subscribe status     PASS
Dashboard publish command      PASS หาก role อนุญาต
Dashboard ใช้ Device password  FAIL หลัง revoke/เปลี่ยน password
```

### ทดสอบการแยกจริง

เปลี่ยนหรือ revoke Dashboard credential ชั่วคราว แล้วตรวจว่า:

```text
Dashboard หยุดเชื่อมต่อ       เป็นเรื่องปกติ
ESP8266 ยังเชื่อมต่อได้        ต้อง PASS
ESP8266 ยังส่ง heartbeat       ต้อง PASS
```

นี่เป็นการทดสอบสำคัญที่สุดว่าการแยก credential สำเร็จจริง

---

## ขั้นที่ 9: ลบหรือ revoke credential เดิม

ห้ามลบ credential เดิมทันทีหลังสร้างบัญชีใหม่ ให้รอจนตรวจครบ:

- Device เชื่อมด้วย Device username ใหม่
- Dashboard เชื่อมด้วย Dashboard username ใหม่
- ไม่มี client สำคัญใช้ username เดิม
- relay command ผ่าน
- sensor/heartbeat ผ่าน
- schedule status ผ่าน
- MQTT reconnect ผ่าน

จากนั้น:

1. ไปที่ HiveMQ Cloud → Access Management → Access Credentials
2. ระบุ credential เดิม
3. ตรวจว่าไม่มี client สำคัญเชื่อมต่อด้วย credential นี้
4. ลบหรือ disable credential เดิม
5. รอช่วง cache ของ HiveMQ และบังคับ reconnect ถ้าระบบรองรับ
6. ตรวจว่า ESP8266 และ Dashboard ที่ใช้ credential ใหม่ยังทำงานได้

HiveMQ ระบุว่า client ที่เชื่อมต่ออยู่แล้วอาจยังคงเชื่อมต่อจนกว่าจะ reconnect และการเปลี่ยน permission/credential อาจใช้เวลาสั้น ๆ กว่าจะ active ดังนั้นควรทดสอบหลัง reconnect ด้วย [1]

---

## ขั้นที่ 10: ตรวจ source code และ secret storage

ใน repository ให้ตรวจว่าไม่มี password ฝังอยู่:

```bash
rg -n -i \
  "mqtt.*password|password.*mqtt|smartfarm-device|smartfarm-dashboard" \
  --glob '!*.patch' \
  --glob '!*.md' \
  .
```

สิ่งที่ควรพบได้:

```text
defaultUsername
credentialSource
sessionStorage
```

สิ่งที่ไม่ควรพบ:

```text
mqtt password จริง
Device password จริง
Dashboard password จริง
```

ตรวจ browser storage:

```js
Object.keys(localStorage).filter(key => key.toLowerCase().includes('mqtt'));
Object.keys(sessionStorage).filter(key => key.toLowerCase().includes('mqtt'));
```

หลัง patch ล่าสุด password ควรอยู่เฉพาะ `sessionStorage` ระหว่าง session ที่ใช้งาน และไม่ควรอยู่ใน `localStorage`

---

## ขั้นที่ 11: ถ้าต้อง rollback

หาก Dashboard ใหม่เชื่อมไม่ได้ แต่ ESP8266 ใช้งานได้:

1. อย่าลบ Device credential ใหม่
2. ตรวจ Dashboard username/password ใหม่
3. ตรวจ Dashboard permission/role
4. ล้าง session storage แล้วกรอกใหม่
5. ตรวจ broker log หรือ HiveMQ connection metrics
6. หากจำเป็นให้สร้าง Dashboard credential ใหม่อีกชุด เช่น `smartfarm-dashboard-recovery`

หาก ESP8266 เชื่อมไม่ได้:

1. เปิด `SmartFarm_Setup`
2. คืนค่า Device username/password เดิมชั่วคราว
3. ตรวจ TLS CA และ broker port
4. ตรวจว่า credential ใหม่ยัง active
5. ทดสอบบน bench ก่อน flash ใหม่

อย่าแก้กลับไปใช้ credential เดียวกันเป็น permanent solution เพราะจะกลับไปมีปัญหาเดิม

---

## ขั้นที่ 12: ขั้นตอนที่ควรทำต่อหลังแยกสำเร็จ

การแยก credential เป็นขั้นแรกเท่านั้น ควรทำต่อดังนี้:

1. สร้าง `smartfarm-device-role`
2. สร้าง `smartfarm-dashboard-role`
3. สร้าง `smartfarm-viewer-role`
4. จำกัด Device ให้ subscribe command และ publish status
5. จำกัด Dashboard ให้ subscribe status และ publish command
6. จำกัด Viewer ให้ subscribe อย่างเดียว
7. ทดสอบ publish/subscribe ที่ไม่ได้รับอนุญาต
8. เปิด audit/log monitoring
9. ตั้งรอบ rotate credential
10. จัดเก็บผลทดสอบและวันที่เปลี่ยน credential

## Checklist สุดท้าย

- [ ] สร้าง `smartfarm-device-01`
- [ ] สร้าง `smartfarm-dashboard-01`
- [ ] ใช้ password คนละชุด
- [ ] เปลี่ยน credential ใน ESP8266 แล้ว
- [ ] ตรวจ ESP8266 connect ด้วย Device username ใหม่
- [ ] ล้าง MQTT credential จาก browser
- [ ] เปลี่ยน Dashboard เป็น Dashboard username ใหม่
- [ ] ตรวจ Dashboard connect ด้วย Dashboard username ใหม่
- [ ] ตรวจ relay/sensor/heartbeat/schedule
- [ ] ทดสอบ Device password ใช้กับ Dashboard ไม่ได้ตามที่ควร
- [ ] ทดสอบ Dashboard password ใช้กับ Device ไม่ได้ตามที่ควร
- [ ] revoke credential เดิมหลังตรวจครบ
- [ ] ไม่พบ password จริงใน source หรือ Git
- [ ] บันทึก credential และวัน rotate ใน password manager

## References

[1]: https://docs.hivemq.com/hivemq-cloud/authn-authz.html "HiveMQ Cloud Authentication and Authorization"

[2]: https://docs.hivemq.com/hivemq-cloud/quick-start-guide.html "HiveMQ Cloud Quick Start Guide"

[3]: https://docs.hivemq.com/hivemq-platform/connect/permissions.html "HiveMQ Platform Permissions and Topic Filters"
