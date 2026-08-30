# SmartFarm ESP8266 Board Reference

เอกสารนี้เป็น **แหล่งอ้างอิงกลางของบอร์ด** สำหรับ SmartFarm และต้องปรับพร้อมเฟิร์มแวร์ทุกครั้งที่มีการเปลี่ยนขา, รีเลย์, เซนเซอร์ หรือ MQTT contract

> Source of truth: `SmartFarm_V6_PRODUCTION.ino` และ `config.js`

## ภาพรวมบอร์ด

| รายการ | ค่าปัจจุบัน |
|---|---|
| บอร์ด | NodeMCU ESP8266 |
| Firmware | `V7.1.0-FIELD-STABILITY` |
| MQTT broker | HiveMQ Cloud ผ่าน TLS |
| MQTT secure port | 8883 (บอร์ด), WebSocket 8884 (Dashboard) |
| เขตเวลา | UTC+7 |
| เซนเซอร์อุณหภูมิ/ความชื้น | DHT11 |
| RTC | DS3231 ผ่าน I²C |
| รีเลย์ | 4 ช่อง, active-low |
| ปั้มน้ำ | 2 HP ตามโปรไฟล์ Dashboard; ค่าไฟใช้ 1.50 kW เป็นค่าประมาณ |
| ท่อ/ระยะส่ง | ท่อ 2 นิ้ว, ระยะส่ง 120 เมตร; อัตราไหลต้องวัดจริง |

## Pin map ที่ตรงกับโค้ด

| อุปกรณ์ | NodeMCU | GPIO/ADC | ค่าทำงาน | หมายเหตุ |
|---|---|---:|---|---|
| DHT11 data | D2 | GPIO4 | อ่านทุก 30 วินาที | ใช้ไลบรารี DHT11 |
| DS3231 SDA | D3 | GPIO0 | I²C | เป็น bootstrap pin; ห้ามให้วงจรดึงระดับผิดตอนบูต |
| DS3231 SCL | D4 | GPIO2 | I²C | เป็น bootstrap pin; ตรวจ pull-up และระดับไฟ |
| ปั้มน้ำ | D5 | GPIO14 | LOW = ON, HIGH = OFF | รีเลย์หลักของปั้ม |
| รีเลย์โซน 1 | D6 | GPIO12 | LOW = ON, HIGH = OFF | เอาต์พุตน้ำโซน 1 |
| ไฟบ้าน | D7 | GPIO13 | LOW = ON, HIGH = OFF | รีเลย์ไฟบ้าน |
| ไฟศาลา | D8 | GPIO15 | LOW = ON, HIGH = OFF | รีเลย์ไฟศาลา; เป็น bootstrap pin |
| Soil sensor | A0 | ADC0 | สำรอง | ยังไม่มี logic ควบคุมใน firmware ปัจจุบัน |
| ปุ่ม reset Wi‑Fi | D1 | GPIO5 | กดค้าง 5 วินาที | เปิด WiFiManager recovery |

## MQTT contract หลัก

รูปแบบ topic ใช้ prefix `smartfarm` และชื่อรีเลย์คือ `pump`, `zone1`, `lighthome`, `lightsala`

| หน้าที่ | Topic |
|---|---|
| สั่งรีเลย์ | `smartfarm/relay/{relay}/set` |
| สถานะรีเลย์ | `smartfarm/relay/{relay}/status` |
| ตั้ง timer ของรีเลย์ | `smartfarm/relay/{relay}/timer/set` |
| สถานะ timer | `smartfarm/relay/{relay}/timer/status` |
| ตั้งตารางอัตโนมัติ | `smartfarm/schedule/{relay}/set` |
| สถานะตาราง | `smartfarm/schedule/{relay}/status` |
| เซนเซอร์ DHT11 | `smartfarm/sensor/dht11` |
| สถานะออนไลน์ | `smartfarm/status/online` |
| heartbeat/diagnostics | `smartfarm/device/status` |
| Emergency command/status | `smartfarm/emergency/set`, `smartfarm/emergency/status` |
| Telegram config/test/status | `smartfarm/config/telegram/set`, `smartfarm/config/telegram/test`, `smartfarm/config/telegram/status` |
| Reminder | `smartfarm/reminder/set`, `smartfarm/reminder/status` |
| AI alert | `smartfarm/ai/alert/set`, `smartfarm/ai/alert/status` |

## ลำดับการแก้ไขเมื่อระบบมีปัญหา

1. ตรวจไฟเลี้ยงและกราวด์ร่วมของ NodeMCU, รีเลย์ และ DS3231 ก่อนแตะโค้ด
2. เปิด Serial Monitor ที่ 115200 baud และตรวจว่า firmware แสดงเวลา RTC/NTP, Wi‑Fi และ MQTT ถูกต้อง
3. ตรวจว่ารีเลย์เป็น **active-low**; ห้ามสลับ LOW/HIGH โดยไม่ตรวจวงจรจริง
4. ถ้าตารางไม่ทำงาน ให้ตรวจ `smartfarm/schedule/{relay}/status`, เวลา UTC+7 และสถานะ Emergency ก่อน
5. ถ้า DS3231 อ่านไม่ได้ ตารางยังใช้ NTP ที่ตรวจสอบแล้วเป็น fallback; หากทั้ง RTC และ NTP ใช้ไม่ได้ ระบบจะไม่เดาเวลาและไม่เปิดปั้มตามตาราง
6. ถ้าปั้มไม่หมุนทั้งที่สถานะรีเลย์ ON ให้ตรวจหน้าสัมผัสรีเลย์, คอนแทคเตอร์, overload, ไฟปั้ม และวงจรแรงดันสูงแยกจาก GPIO
7. ปุ่ม D1 ใช้ล้าง/กู้ Wi‑Fi เมื่อกดค้าง 5 วินาที; ไม่ใช่ปุ่มหยุดปั้มฉุกเฉิน

## ค่าจังหวะทำงานใน firmware

| งาน | ช่วงเวลา |
|---|---:|
| อ่าน DHT11 | 30 วินาที |
| heartbeat | 10 วินาที |
| ประเมินตาราง | 1 วินาที |
| MQTT reconnect | 5 วินาที |
| Wi‑Fi reconnect | 15 วินาที |
| sync RTC/NTP | 6 ชั่วโมง |
| หมดเวลา heartbeat ที่ Dashboard | 25 วินาที |

## การแก้ไขเอกสารครั้งต่อไป

เมื่อเปลี่ยน pin หรืออุปกรณ์ ให้แก้ตามลำดับ: `SmartFarm_V6_PRODUCTION.ino` → `config.js` (`HARDWARE_PINS`/topics) → `settings.html` Pin map → เอกสารนี้ → `dashboard-smoke-test.mjs` จากนั้นรัน syntax check และ smoke test ก่อน commit

ไม่ควรใส่ MQTT password, OTA password, Telegram Bot Token หรือ secret ใด ๆ ในเอกสารหรือ repository
