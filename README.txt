สวนลุงนะ Smart Farm V7.2.0 OTA STABLE — Unified Dashboard
=========================================================

เอกสารนี้อธิบายระบบที่ checkout อยู่ใน repository นี้ ใช้อ้างอิงก่อนติดตั้ง ตรวจสอบ และแก้ไขระบบจริง

## ภาพรวมระบบ

SmartFarm ประกอบด้วย Dashboard แบบ Progressive Web App, NodeMCU ESP8266 และ MQTT ผ่าน TLS โดยใช้หน้าเดียวเป็นจุดเข้าหลัก (`dashboard/`) เปลี่ยนมุมมองด้วย route ภายในหน้าเดียว จึงใช้ MQTT manager/browser client เพียงหนึ่งชุด

| ส่วน | หน้าที่ |
|---|---|
| Dashboard (`dashboard/`) | หน้าหลัก, สถานะ ESP8266, เซนเซอร์, รีเลย์, สภาพอากาศ, ตั้งค่า MQTT, เครื่องมือการเงิน และแผนเวลา |
| ระบบน้ำ (`?page=water`) | ควบคุมรีเลย์และส่งตารางปั๊มตรงไปยัง ESP8266 โดยมี interlock จาก MQTT/heartbeat สดและ confirmation |
| แผนเวลา Firebase | บันทึกแผนส่วนตัวในบัญชี Firebase เท่านั้น **ไม่ส่งหรือสั่งงาน ESP8266** |
| การเงิน (`?page=finance`) | รายรับ รายจ่าย รายงาน และผลผลิตแตงกวา ภายใต้บัญชี Firebase |
| บัญชี/ผู้ดูแล/OTA | หน้าจัดการสิทธิ์และ firmware upload แยกตามการป้องกันเดิม |
| URL เดิม (`finance.html`, `control-room/`) | เปลี่ยนเส้นทางไปยัง Dashboard หลักเพื่อรักษา bookmark เดิม |
| ESP8266 | อ่านเซนเซอร์, ควบคุมรีเลย์, รันตารางเวลา, sync เวลา, heartbeat, MQTT และ OTA |
| Firebase | Authentication, profile, finance และแผนเวลาส่วนตัวที่แยกตามบัญชี |
| LittleFS | ตารางเวลา, reminder, MQTT credentials, OTA password และการตั้งค่าบนอุปกรณ์ |

> แผน Firebase เป็นเพียงบันทึกวางแผน ส่วนตารางใน ESP เป็นคำสั่งจริง หากอุปกรณ์อยู่โหมด AUTO ตารางอาจเปิดปั๊มได้ทันทีเมื่อช่วงเวลาตรงกัน

## บอร์ดและ Pin map

แหล่งอ้างอิงหลักของการต่อบอร์ดอยู่ที่ `BOARD_REFERENCE.md` และต้องสอดคล้องกับ `SmartFarm_V7.2.0_OTA_STABLE.ino` กับ `platformio.ini`

| อุปกรณ์ | NodeMCU | GPIO/ADC | พฤติกรรม |
|---|---|---:|---|
| DHT11 data | D2 | GPIO4 | อ่านอุณหภูมิและความชื้นทุก 30 วินาที |
| DS3231 SDA | D3 | GPIO0 | I²C; เป็น bootstrap pin |
| DS3231 SCL | D4 | GPIO2 | I²C; เป็น bootstrap pin |
| ปั้มน้ำ | D5 | GPIO14 | รีเลย์ active-low: LOW = ON, HIGH = OFF |
| รีเลย์โซน 1 | D6 | GPIO12 | รีเลย์ active-low |
| ไฟบ้าน | D7 | GPIO13 | รีเลย์ active-low |
| ไฟศาลา | D8 | GPIO15 | รีเลย์ active-low และเป็น bootstrap pin |
| Soil sensor | A0 | ADC0 | สำรอง ยังไม่มี logic ควบคุมใน firmware |
| ปุ่ม Wi-Fi reset | D1 | GPIO5 | กดค้าง 5 วินาทีเพื่อเปิด WiFiManager recovery |

ปั้มในโปรไฟล์ Dashboard คือ **2 HP**, ใช้กำลังคำนวณเริ่มต้น **1.50 kW**, ท่อ **2 นิ้ว** และระยะส่ง **120 เมตร** อัตราการไหลเป็นค่าประมาณ ต้องวัดจาก flow meter หากต้องการค่าใช้น้ำที่แม่นยำ

## การใช้งานหน้าเว็บ

### Dashboard

Dashboard ใช้ดูสถานะและสั่งงานเป็นหลัก มี Topbar แสดงสถานะพร้อมใช้งานและเวลา RTC, เซนเซอร์, รีเลย์, แปลงแตงกวา และสภาพอากาศ แถบเมนูด้านล่างเป็น floating navigation ติดหน้าจอตลอดเวลา รองรับ safe-area ของ iPhone และเพิ่มพื้นที่กันชนไม่ให้บังข้อมูล โดย Dashboard ไม่แสดงเลเยอร์สรุป **ตารางเวลา**, **Safety Control** หรือ **สถานะระบบ** ซ้ำด้านล่างอีกแล้ว

ระบบมี Simple และ Advanced mode โดย Advanced mode แสดง diagnostics, telemetry chart, relay runtime และเครื่องมือสำรองข้อมูลเพิ่มเติม

### ตั้งค่า

หน้า Settings เป็นศูนย์รวมค่าคอนฟิก ได้แก่ MQTT connection, ค่าไฟและการใช้น้ำ, Firmware OTA, Telegram alerts, การสำรองข้อมูล, ความปลอดภัย และ hardware reference

ส่วนค่าไฟและการใช้น้ำรองรับการเลือกช่วงวันที่, รีเฟรชข้อมูล, เริ่มนับรอบใหม่, ดูประวัติเดิม และปรับอัตราการไหล กำลังปั้ม และค่าไฟต่อ kWh โดยการเริ่มนับใหม่จะตัดยอดปัจจุบันก่อนเวลาที่กด แต่ไม่ลบประวัติเก่า

สูตรประมาณการคือ:

- ปริมาณน้ำ = เวลาปั้มทำงาน (นาที) × อัตราการไหล (ลิตร/นาที)
- พลังงาน = เวลาปั้มทำงาน (ชั่วโมง) × กำลังปั้ม (kW)
- ค่าไฟ = พลังงาน (kWh) × ค่าไฟต่อหน่วย

ค่าตั้งต้นปัจจุบันคืออัตราไหล 20 ลิตร/นาที, กำลัง 1.50 kW และค่าไฟ 4.20 บาท/kWh

### ตั้งเวลา

ตารางเปิด–ปิดของแต่ละรีเลย์ถูกส่งไปบันทึกที่ ESP8266 และทำงานบนอุปกรณ์ เมื่อบันทึกแล้วตารางยังทำงานได้แม้ Dashboard หรือ MQTT หลุดชั่วคราว หากนาฬิกาในอุปกรณ์ใช้ได้

## เวลาและตารางอัตโนมัติ

DS3231 เป็นแหล่งเวลาหลักเมื่อพบและเวลา valid; NTP ใช้ sync DS3231 เมื่อมี Wi-Fi และเป็น fallback ที่ผ่านการตรวจสอบเมื่อ RTC ใช้งานไม่ได้ หากทั้ง RTC และ NTP ใช้ไม่ได้ ระบบจะไม่เดาเวลาและจะไม่เปิดปั้มตามตารางเพื่อป้องกันการทำงานผิดเวลา

ค่าการทำงานหลักของ firmware:

| งาน | ช่วงเวลา |
|---|---:|
| อ่าน DHT11 | 30 วินาที |
| heartbeat | 10 วินาที |
| ประเมินตาราง | 1 วินาที |
| MQTT reconnect | 5 วินาที |
| Wi-Fi reconnect | 15 วินาที |
| sync RTC/NTP | 6 ชั่วโมง |
| timeout heartbeat ใน Dashboard | 25 วินาที |


## MQTT topics

ใช้ prefix `smartfarm` และชื่อรีเลย์ `pump`, `zone1`, `lighthome`, `lightsala`

| หน้าที่ | Topic |
|---|---|
| สั่งรีเลย์ / สถานะ | `smartfarm/relay/{relay}/set` / `smartfarm/relay/{relay}/status` |
| ตาราง / สถานะตาราง | `smartfarm/schedule/{relay}/set` / `smartfarm/schedule/{relay}/status` |
| เซนเซอร์ DHT11 | `smartfarm/sensor/dht11` |
| ออนไลน์ | `smartfarm/status/online` |
| heartbeat/diagnostics | `smartfarm/status/device` |
| Emergency | `smartfarm/emergency/set` / `smartfarm/emergency/status` |
| Telegram | `smartfarm/config/telegram/set`, `/test`, `/status` |
| Reminder | `smartfarm/reminder/set` / `smartfarm/reminder/status` |
| AI alert | `smartfarm/ai/alert/set` / `smartfarm/ai/alert/status` |

ห้ามสร้าง topic โหมด MANUAL/AUTO ใหม่โดยไม่อัปเดตทั้ง firmware, `config.js`, เอกสาร contract และ regression test ให้ตรงกัน

## ความปลอดภัยและการป้องกันปั้ม

รีเลย์ทุกจุดเริ่มต้นเป็น OFF ตอนบูต Emergency Stop จะปิดรีเลย์ทั้ง 4 จุดและล็อกการเปิดซ้ำจนกว่าจะปลดล็อก แต่ Emergency Stop ใน Dashboard เป็นคำสั่ง MQTT ไม่ใช่ physical emergency disconnect

สำหรับปั้มจริงควรติดตั้ง physical E-stop หรือ contactor, ลูกลอยกันปั้มแห้ง, pressure switch และ thermal overload ตามวงจรไฟฟ้าที่เหมาะสม การตรวจว่ารีเลย์เป็น ON ไม่ได้ยืนยันว่าปั้มหมุนจริง ต้องตรวจไฟ, หน้าสัมผัส, คอนแทคเตอร์ และปั้มแยกต่างหาก

Dashboard Rain Protection เป็น advisory จาก Open-Meteo เท่านั้น ESP8266 ไม่ใช้ weather API เป็นเงื่อนไขสั่งปั้มอัตโนมัติ

ระหว่าง OTA ระบบบังคับรีเลย์ทั้งหมดเป็น OFF ก่อนเขียน Flash ระบบจะตรวจว่าขนาดข้อมูลครบและให้ `Update.end(true)` ตรวจสอบ image ก่อนตอบว่าสำเร็จ จากนั้นจึงเว้นเวลา 3 วินาทีให้ response/การอัปโหลดฝั่ง browser จบก่อนรีบูต หากอัปโหลดไม่ครบ เขียนไม่สำเร็จ หรือการตรวจสอบ image ล้มเหลว จะไม่รีบูตโดยอัตโนมัติ

## ข้อมูลลับ

MQTT username/password ของ Dashboard ต้องกรอกโดยผู้ดูแลและไม่ใส่ใน `config.js` ค่า credential ของ ESP8266, OTA password, Telegram Bot Token และ Chat ID เก็บใน LittleFS หรือช่องทางที่กำหนด ห้าม commit ลง repository

การ export backup ของ Dashboard ไม่รวม password, token, secret และ credential-like keys Firebase rules จำกัด profile, finance, analytics และ roles ตามผู้ใช้ ควรตั้ง HiveMQ ACL สำหรับ authorization ระดับ broker ด้วย

## โครงสร้างไฟล์สำคัญ

| ไฟล์ | หน้าที่ |
|---|---|
| `SmartFarm_V6_PRODUCTION1.ino` | Firmware หลักของ ESP8266 |
| `config.js` | MQTT config, topics, pins, relay names และ APP_STATE |
| `app.js` | Dashboard lifecycle, MQTT UI และสถานะหลัก |
| `farm-analytics.js` | telemetry, relay runtime, ค่าไฟ และประวัติการใช้งาน |
| `schedule.js` | UI และ publish ตารางเวลา |
| `mqtt-handler.js` | MQTT connection, subscription และ message routing |
| `BOARD_REFERENCE.md` | Pin map, MQTT contract และ troubleshooting ฉบับเต็ม |
| `dashboard-smoke-test.mjs` | syntax/contract regression checks |
| `usage-reset-calculation-test.mjs` | ตรวจ reset และสูตรค่าไฟด้วยกรณีทดสอบที่กำหนดแน่นอน |

## Build และ validation

เป้าหมาย Arduino คือ NodeMCU 1.0 (ESP-12E Module): `esp8266:esp8266:nodemcuv2` โดยใช้ PlatformIO environment ชื่อ `nodemcuv2` จาก `platformio.ini`

Firmware release ปัจจุบันคือ `SmartFarm_V7.2.0_OTA_STABLE.ino` ใช้ `espressif8266@4.2.0` ซึ่งติดตั้ง Arduino ESP8266 Core 3.1.2, NodeMCU 1.0 / ESP-12E, CPU 80 MHz, Flash 4 MB และ upload speed 115200 baud หลังแก้ firmware ให้ compile ก่อน upload ทุกครั้ง การ build สำเร็จยืนยันเฉพาะการ compile เท่านั้น ต้องทดสอบ Wi-Fi, MQTT, DHT11, DS3231, รีเลย์ และ OTA กับ NodeMCU จริงแยกต่างหาก

คำสั่งตรวจสอบหลัก:
```bash
mkdir -p src
cp SmartFarm_V7.2.0_OTA_STABLE.ino src/main.ino
pio run -e nodemcuv2
cp .pio/build/nodemcuv2/firmware.bin SmartFarm_V7.2.0_OTA_STABLE.bin
node firmware-v720-contract-test.mjs
node dashboard-contract-test.mjs
node dashboard-layout-audit.mjs
node dashboard-browser-smoke.mjs
node --check app.js
node --check farm-analytics.js
node dashboard-smoke-test.mjs
node usage-reset-calculation-test.mjs
node schedule-regression-test.mjs
node ai-advisor-regression-test.mjs
node firmware-logic-regression-test.mjs
node e2e-navigation-test.mjs
npm --prefix functions run lint
git diff --check
```

ไฟล์ `.bin` สร้างโดย ESP8266 Core จาก eboot และ application image สำหรับ flash ผ่าน serial หรือ OTA ใช้ artifact นี้กับ NodeMCU ที่มี flash/partition layout ตรงกับ build และทดสอบกับอุปกรณ์จริงก่อนใช้งาน
ไฟล์ release มีขนาด **610,176 bytes**; SHA-256 คือ `a5a10f5330f946748e51219fdd2fe409a89f924bcac0894db778d0febcc7d469` ผล build ล่าสุดใช้ RAM 42,268/81,920 bytes (51.6%) และ Flash 606,016/1,044,464 bytes (58.0%) จึงเหลือ build-time flash headroom 438,448 bytes ภายใต้ NodeMCU partition ที่ build ใช้ ค่า free heap และ free sketch space จริงยังต้องอ่านจากอุปกรณ์ที่เปิดทำงาน

GitHub Actions รันชุดตรวจสอบเดียวกันทุก push และ pull request รวมถึง simulated
browser integration สำหรับหน้า Settings/MQTT. งาน browser test ใช้ Chrome ที่
workflow ติดตั้งและส่งตำแหน่ง executable ผ่าน `CHROMIUM_PATH`; ในเครื่อง local
ให้ติดตั้ง `playwright-core` และ Chromium ก่อนรัน `node tools/settings-mqtt-e2e.mjs`.

ก่อนแก้ระบบครั้งต่อไป ให้ตรวจ `BOARD_REFERENCE.md`, firmware, `config.js` และ smoke test พร้อมกัน หากเปลี่ยน pin, topic, ชื่อรีเลย์, storage key หรือ DOM id ต้องอัปเดตเอกสารและ regression assertion ใน commit เดียวกัน

## สถานะการตรวจสอบล่าสุด
