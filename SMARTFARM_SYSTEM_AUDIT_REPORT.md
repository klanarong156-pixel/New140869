# รายงานตรวจสอบและปรับปรุงระบบ Smart Farm

**โครงการ:** สวนลุงนะ Smart Farm  
**วันที่ตรวจสอบ:** 21 สิงหาคม 2026  
**ผู้จัดทำ:** Manus AI  
**ขอบเขต:** NodeMCU ESP8266, firmware, MQTT, Dashboard, Firebase, ตารางเวลา, รีเลย์, timer, OTA, Wi‑Fi Setup และ Telegram

## บทสรุปผู้บริหาร

ระบบถูกตรวจสอบและปรับปรุงให้ใช้แนวทาง **ตั้งตารางแล้วทำงานเอง** โดยถอด contract ของ AUTO/MANUAL ออกจาก Dashboard และ firmware รุ่นใช้งานจริง การตั้งเวลาจะถูกเก็บไว้ใน ESP8266 และ `runSchedules()` จะตรวจเวลาเมื่อ clock พร้อม โดยไม่รอการเปิดหน้าเว็บหรือการเลือกโหมด

ข้อจำกัดสำคัญคือการตรวจในครั้งนี้เป็นการตรวจ source, contract, static smoke test และการคอมไพล์แบบ reproducible ใน sandbox ยังไม่มีการต่อบอร์ดจริง จึงไม่สามารถยืนยันระดับฮาร์ดแวร์ เช่น ขา D5/D6, active-low relay, คุณภาพ Wi‑Fi ภาคสนาม, เวลาจริงของ RTC หรือการเปิดปั๊มภายใต้โหลดไฟฟ้าได้ 100% จนกว่าจะทดสอบกับอุปกรณ์จริง

## ผลการตรวจและการแก้ไข

| ระบบ | ผลตรวจ | การแก้ไข/สถานะ |
|---|---|---|
| ตารางเวลา | เดิมพึ่ง mode และเสี่ยงทำงานไม่สอดคล้องกับหน้าเว็บ | ให้ ESP8266 ตรวจตารางเองเมื่อเวลาถูกต้อง และรับตารางใหม่แล้วนำไปใช้ทันที |
| AUTO/MANUAL | มี contract เก่าใน firmware, handler และ smoke test | ถอด topic, callback, UI binding และข้อความโหมดออกจากไฟล์ใช้งานจริง |
| ปั๊ม | มี safety cutoff 30 นาทีและ logic ตัดเมื่อ MQTT หลุด | เอาเพดาน 30 นาทีและการตัดจาก MQTT หลุดออก ปั๊มทำตามตารางหรือคำสั่งล่าสุด |
| Timer | ต้องรองรับเวลาที่ผู้ใช้เลือกไม่จำกัด | เพิ่ม payload `UNLIMITED`; สถานะรายงาน `active`, `unlimited`, `remaining` |
| Timer ปกติ | ต้องป้องกัน overflow และหมดเวลาแล้วปิดรีเลย์ | ใช้ `uint32_t` และการเปรียบเทียบแบบรองรับ millis rollover ใน loop |
| MQTT | ต้องให้ topic Dashboard กับ firmware ตรงกัน | ตรวจ relay, timer, schedule, device status และ Telegram topics แล้ว |
| Schedule ว่าง | ตารางว่างไม่ควรไปปิดคำสั่ง manual ของรีเลย์อื่น | `applyAutoState()` ทำงานเฉพาะรีเลย์ที่มีตารางจริง |
| RTC/NTP | ถ้าเวลาไม่พร้อม ตารางไม่ควรเปิดผิดเวลา | `runSchedules()` เรียกใช้งานเฉพาะเมื่อ `clockIsValid()` เป็นจริง |
| OTA | หน้าเก่าอธิบาย ArduinoOTA แต่หน้าใหม่ใช้ HTTP upload | ปรับ `ota.html` ให้ใช้ flow เดียวกับ Settings และเพิ่มการตรวจไฟล์ `.bin` |
| OTA password | ถ้าไม่มี `ota_pass` ระบบต้องไม่เปิด OTA | คงนโยบายปิด OTA จนกว่าจะตั้งค่าผ่าน `SmartFarm_Setup` |
| Weather | guard เดิมยังค้นหาปุ่มโหมดที่ถูกลบ | เปลี่ยนเป็น advisory-only ไม่ควบคุมหรือบล็อกตารางบน ESP8266 |
| Telegram | ต้องส่งค่าผ่าน MQTT และทดสอบได้ | ตรวจ payload `botToken/chatId`, topic set/test และ `retain:false` แล้ว |
| Firebase | ใช้เป็น auth/data layer ของ Dashboard ไม่ใช่ตัวตัดสินเวลาที่ ESP8266 | ควรใช้สำหรับสิทธิ์และบันทึกข้อมูล ไม่ควรย้าย schedule runtime ออกจาก ESP8266 |

## Contract ที่ตรวจแล้ว

| Contract | ค่าใช้งาน |
|---|---|
| Base topic | `smartfarm` |
| Relay command | `smartfarm/relay/{relay}/set` |
| Relay timer | `smartfarm/relay/{relay}/timer/set` |
| Timer unlimited | payload `UNLIMITED` |
| Timer cancel | payload `CANCEL` หรือค่า `0` ตาม flow ที่รองรับ |
| Schedule set | `smartfarm/schedule/{relay}/set` |
| Schedule status | `smartfarm/schedule/{relay}/status` |
| Device status | `smartfarm/device/status` |
| Online status | `smartfarm/status/online` |
| Telegram config | `smartfarm/config/telegram/set` |
| Telegram test | `smartfarm/config/telegram/test` |

## ผลการทดสอบ

การตรวจ syntax ของ JavaScript ที่เกี่ยวข้องผ่านทั้งหมด ได้แก่ `config.js`, `mqtt-handler.js`, `app.js`, `schedule.js`, `telegram-settings.js`, `weather.js`, `auto-weather-guard.js` และ `dashboard-ota.js`

Dashboard runtime contract smoke test ผ่าน **26/26 รายการ** ครอบคลุม endpoint MQTT, relay IDs, relay/timer/schedule topics, unlimited timer, schedule schema, Telegram payload, firmware topic subscription, OTA controller, weather advisory และการไม่เหลือ mode contract ในไฟล์ใช้งานจริง

Firmware คอมไพล์ผ่านสำหรับ `esp8266:esp8266:nodemcuv2` ด้วย Arduino ESP8266 core 3.1.2 โดยใช้หน่วยความจำดังนี้

| รายการ | ใช้ | ความจุ | สัดส่วน |
|---|---:|---:|---:|
| Global RAM | 36,420 bytes | 80,192 bytes | 45% |
| IRAM | 62,099 bytes | 65,536 bytes | 94% |
| Flash code | 537,492 bytes | 1,048,576 bytes | 51% |
| Firmware binary | 579,488 bytes | — | — |

> **ข้อควรระวัง:** IRAM ใช้ 94% ซึ่งยังคอมไพล์ผ่าน แต่เหลือ headroom ไม่มาก การเพิ่ม library, callback ที่ใหญ่ขึ้น หรือ debug code จำนวนมากควรหลีกเลี่ยง

**SHA-256 ของ firmware รุ่นตรวจสอบล่าสุด:**

```text
5d4c6899323c970b49d9bf7bf158ada1ae0b4bbd0ddc6ca704c14c31aec52fa4
```

## สิ่งที่ควรเพิ่ม

ควรเพิ่ม **watchdog และ brownout/ไฟเลี้ยง monitoring เชิงปฏิบัติ** โดยตรวจ boot reason, free heap, MQTT reconnect count และเวลาที่รีเลย์ทำงานใน heartbeat เพื่อช่วยวิเคราะห์ปั๊มหยุดหรือบอร์ดรีสตาร์ตโดยไม่ต้องต่อ Serial Monitor ตลอดเวลา

ควรเพิ่ม **schedule version และ acknowledgement** ให้ Dashboard รู้ว่าตารางที่ ESP8266 ใช้อยู่เป็นเวอร์ชันเดียวกับที่ผู้ใช้เพิ่งบันทึก รวมถึงเพิ่ม `lastScheduleRun` และ relay reason เช่น `schedule`, `timer`, `manual` ใน status เพื่อแก้ปัญหาว่าคำสั่งใดเป็นผู้เปิดรีเลย์

ควรเพิ่ม **การล็อก IP หรือ mDNS ที่แสดงผลแน่นอน** สำหรับ OTA เช่นแสดง IP ปัจจุบันใน Dashboard และรองรับชื่อ `smartfarm-v8.local` เฉพาะเมื่อทดสอบกับเราเตอร์จริงแล้ว เพื่อไม่ให้ผู้ใช้ลอง IP ตัวอย่างผิดตัว

ควรเพิ่ม **failsafe ทางไฟฟ้าแยกจากข้อกำหนด unlimited** สำหรับปั๊ม เช่น emergency stop, ลูกลอย, pressure switch หรือ thermal overload ตามวงจรจริง เพราะการไม่จำกัดเวลาใน software ไม่ควรถูกตีความว่าให้ปั๊มทำงานโดยไม่มีการป้องกันทางกายภาพ

## สิ่งที่ควรลดหรือไม่ควรเพิ่ม

ไม่ควรนำ AUTO/MANUAL กลับมาใน UI หรือ MQTT เพราะทำให้ผู้ใช้ต้องเข้าใจ state machine ที่ไม่จำเป็น และทำให้ตารางกับคำสั่ง timer ขัดแย้งกันได้ง่าย

ไม่ควรให้ Firebase เป็นตัวจับเวลาเปิดปั๊มหลัก เนื่องจากการทำงานของตารางควรอยู่ใน ESP8266 เพื่อให้ยังทำงานได้เมื่อ Dashboard หรือ MQTT หลุดชั่วคราว

ไม่ควรเพิ่มการส่ง Telegram ทุก loop หรือทุก heartbeat เพราะจะทำให้เกิด rate limit และทำให้การแจ้งเตือนสำคัญถูกกลบ ควรส่งเฉพาะเหตุการณ์ เช่น boot, Wi‑Fi เปลี่ยนสถานะ, MQTT เชื่อมต่อ, OTA, schedule update และ fault

ไม่ควรเปิด HTTP OTA ออกสู่อินเทอร์เน็ตโดย port forwarding ควรใช้เฉพาะ LAN และตั้ง `ota_pass` ที่คาดเดายาก หากต้องอัปเดตนอกบ้านควรใช้ VPN ก่อนเข้าถึง LAN

## แผนทดสอบกับบอร์ดจริงก่อนใช้งานเต็มรูปแบบ

ให้เริ่มจากปิดโหลดไฟฟ้าหรือถอดสายปั๊มออก แล้วทดสอบด้วย LED/รีเลย์เปล่า ตรวจว่าเวลาเปิดและปิดตรงกับตารางปกติและตารางข้ามเที่ยงคืน จากนั้นทดสอบ timer ปกติ, `UNLIMITED`, `CANCEL`, MQTT หลุด, Wi‑Fi หลุด และการรีบูต โดยบันทึกเวลาจริงและสถานะจาก Telegram

หลังจากนั้นจึงต่อโหลดจริงผ่านอุปกรณ์ป้องกันที่เหมาะสม ทดสอบปั๊มด้วยช่วงเวลาสั้นก่อน และตรวจว่าการปิดจากตาราง, การกดปิดจาก Dashboard และ emergency stop สามารถหยุดรีเลย์ได้จริง การทดสอบนี้ควรมีผู้ดูแลอยู่หน้างานตลอดเวลา

## ไฟล์ที่เกี่ยวข้องในการส่งมอบ

| ไฟล์ | หน้าที่ |
|---|---|
| `SmartFarm_V6_PRODUCTION.ino` | source firmware รุ่นตรวจสอบล่าสุด |
| `build/SmartFarm_V6_PRODUCTION.ino.bin` | binary สำหรับ HTTP OTA |
| `SMARTFARM_SYSTEM_AUDIT_REPORT.md` | รายงานฉบับนี้ |
| `dashboard-smoke-test.mjs` | smoke test contract ของ Dashboard |
| `ota.html` | หน้า OTA แบบ browser upload รุ่นปรับปรุง |

## สรุปสถานะ

ระบบฝั่ง source และ contract อยู่ในสถานะพร้อมเผยแพร่หลังผ่าน syntax check, smoke test 26/26 และ firmware compile แล้ว อย่างไรก็ตามคำว่า **เสถียร 100%** ไม่สามารถรับรองจาก sandbox ได้ เพราะยังไม่ได้ทดสอบกับ NodeMCU, relay module, RTC, Wi‑Fi router และปั๊มจริง รายการทดสอบภาคสนามในหัวข้อก่อนหน้าคือขั้นตอนที่จำเป็นก่อนนำ firmware ไปควบคุมโหลดไฟฟ้าจริง
