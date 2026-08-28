# Audit และ hardening: schedule, relay, RTC, MQTT

วันที่ audit และทดสอบ: 2026-08-28
สถานะเอกสาร: post-fix audit ใน working tree; ยังไม่ commit และยังไม่ push ณ เวลาบันทึกนี้

## สรุปผลการตรวจ

การตรวจแยก **คำสั่งควบคุม**, **การเขียน GPIO**, และ **การ publish status** ออกจากกันแล้ว ไม่พบเส้นทางที่ reconnect หรือ SharedWorker replay จะส่ง `smartfarm/schedule/<relay>/set` ซ้ำ เพราะ SharedWorker replay เฉพาะสถานะล่าสุด ส่วน `mqtt-handler.js` ไม่ queue control command ตอน offline และ Firmware มี callback MQTT inbound จุดเดียวสำหรับ relay, timer และ schedule

พบและแก้ไขปัญหาที่พิสูจน์ได้สี่กลุ่ม ได้แก่ status publish flood จาก loop timer ที่ไม่มี timer จริง, OFF→ON pulse เมื่อ timer หมดอายุระหว่าง schedule ที่ยังต้อง ON, rapid duplicate schedule publish จาก Dashboard และการยอมรับเวลา/ข้อมูล schedule ที่ผิดรูปแบบแบบเงียบ ๆ นอกจากนี้เพิ่มการตรวจผลการเขียน schedule persistence และคืนค่าตารางเดิมหากบันทึกไม่สำเร็จ

## Call graph และ priority ที่ตรวจยืนยัน

| เส้นทาง | ผลการตรวจและ policy ที่คงไว้ |
|---|---|
| MQTT `relay/<name>/set` | เข้า `relaySet()` จุดเดียว; ON ถูกบล็อกโดย Emergency/OTA; OFF ล้าง timer ก่อนเปลี่ยน GPIO |
| MQTT `relay/<name>/timer/set` | เข้า `startRelayTimer()` จุดเดียว; `UNLIMITED` และ seconds ที่ถูกต้องเปิด timer; `0`/`CANCEL` ยกเลิกและปิดครั้งเดียว |
| MQTT `schedule/<name>/set` | parse แบบ candidate ก่อน commit; `DELETE` ล้างทั้ง 4 slot; malformed enabled time, slot count เกิน 4 และ overlap ถูก reject โดยไม่เปลี่ยนตารางเดิม |
| Main loop timer/schedule | `runRelayTimers()` ทำก่อน `runSchedules()`; เมื่อ timer หมดจะอ่าน RTC แล้วคำนวณ desired schedule ก่อน จึงไม่สั่ง OFF หาก schedule ปัจจุบันยังต้อง ON; นอก schedule จะ OFF ได้ครั้งเดียว |
| Manual/timer priority | timer ที่ active (`finite` หรือ `UNLIMITED`) เป็นเจ้าของ relay จนหมด/ถูกยกเลิก; schedule ทำงานต่อเมื่อไม่มี timer active; manual ON/OFF ใช้ contract เดิม ไม่เพิ่ม mode หรือ topic ใหม่ |
| Actual GPIO writes | `relaySetRaw()` มี `if (wasOn == on) return` จึงไม่เขียน GPIO ซ้ำเมื่อ state ไม่เปลี่ยน; Emergency/OTA ยังบังคับ OFF โดยตรงตาม behavior เดิม |
| Status publication | timer status ของ timer ที่ active publish เป็นระยะ; relay ที่ไม่มี finite/unlimited timerไม่เข้า expiry branch จึงไม่เกิด repeated publish จากเงื่อนไข `!relayOn(i)` เดิม; retained status replay ยังอาจทำให้ UI ได้ event ซ้ำได้ แต่ไม่ใช่คำสั่งควบคุมซ้ำ |

> Schedule automation ใช้ `readRtcNow()` โดยตรงและหยุดเมื่อ RTC invalid; การมี NTP fallback ใน `clockIsValid()`, `currentMinutes()` และ reminder/diagnostic path ไม่ถูกเปลี่ยน เพราะไม่ใช่ schedule clock path

## รายการแก้ไขที่ทำ

### Firmware

`runRelayTimers()` ตรวจ `relayTimerUntil[i]` ก่อนเข้า expiry branch และข้าม relay ที่ไม่มี finite deadline หาก timer หมดอายุ จะอ่าน RTC ที่ valid, ตรวจ Emergency/OTA และตรวจ schedule desired ปัจจุบันก่อนเลือกปลายทาง หาก schedule ยังต้องเปิด จะคง relay ON; หากไม่ต้องเปิดจะเรียก `relaySetRaw(i, false)` เพียงครั้งเดียว จากนั้นจึง publish status ของ transition นั้น

`parseHM()` ตรวจความยาว 5 ตัวอักษร รูปแบบ `HH:MM` และช่วงชั่วโมง `00–23`/นาที `00–59` แบบ strict ส่วน MQTT schedule parser และ persisted config parser จะ reject enabled slot ที่ malformed หรือเวลาเปิดเท่ากับเวลาปิด และตรวจ overlap แบบครอบคลุมช่วงข้ามเที่ยงคืนด้วยการตรวจทุกนาทีใน 24 ชั่วโมง

`saveConfig()` เปลี่ยนเป็นคืนค่า `bool`, ตรวจ `ArduinoJson` document overflow, ตรวจ file open และจำนวน bytes ที่เขียนจริง เมื่อ schedule persistence ล้มเหลว callback จะคืนค่า candidate เดิม, publish status เดิมถ้าเชื่อมต่ออยู่ และไม่ประกาศผลสำเร็จปลอม

### Dashboard

`schedule.js` ใช้ `pendingSchedule` แบบ one-flight ต่อการส่ง Save/Delete รวมถึง fingerprint ของ payload และ matching status event จากอุปกรณ์ เมื่อมีคำสั่งค้างอยู่จะไม่ส่งซ้ำจนกว่า status ที่ตรงกันจะกลับมา หรือ timeout 8 วินาทีหมดลงแล้วจึงอนุญาตให้ลองใหม่ การเปลี่ยนแปลงนี้ไม่เปลี่ยน broker, base topic, topic name หรือ payload schema เดิม

การตรวจเวลาใช้ค่าจริงของชั่วโมงและนาที ไม่ยอมรับ `24:00`, `12:60` หรือรูปแบบผิด และยังคง behavior ที่ผู้ใช้อนุมัติไว้ว่าไม่มี checkbox แยก: `00:00–00:00` คือ unused ส่วนช่วงที่เวลาเปิดและปิดต่างกันคือ enabled candidate

## Acceptance criteria

| เกณฑ์ | ผล |
|---|---|
| ไม่เพิ่ม broker/topic/credentials/mode contract | ผ่านจาก contract audit และ smoke suite |
| ไม่เพิ่ม forced 30-minute pump cutoff | ผ่าน; source และ contract audit ยังยืนยัน policy เดิม |
| ไม่ส่ง schedule Save ซ้ำจากการกดซ้ำก่อน ACK | ผ่าน deterministic Node regression test |
| Save/Delete ordering เป็น one-flight | ผ่าน deterministic Node regression test |
| normal interval และ adjacent interval | ผ่าน |
| overlap ปกติและ cross-midnight | ผ่าน client regression และ Firmware source/logic checks |
| invalid `24:00`/`12:60` | ผ่าน client regression และ strict Firmware parser |
| timer expiry ใน active schedule ไม่มี OFF pulse | ผ่าน host-model regression และ compiled source |
| timer expiry นอก schedule ปิด OFF หนึ่งครั้ง | ผ่าน host-model regression |
| Emergency/OTA/RTC invalid fail safe | ผ่าน host-model regression และ source checks |
| malformed schedule ไม่ commit บางส่วน | ผ่าน source review; enabled malformed slot และ slot count เกิน 4 ถูก reject ก่อน commit |
| persistence write failure ไม่ประกาศ success | ผ่าน source review และ smoke check |
| Firmware compile จริงด้วย ESP8266 core 3.1.2 | ผ่าน |

## ผลทดสอบล่าสุดก่อน commit/push

คำสั่งและผลที่ตรวจในเครื่องมีดังนี้

| Test | ผลลัพธ์ |
|---|---|
| `node --check` สำหรับไฟล์ `*.js`/`*.mjs` จำนวน 34 ไฟล์ | ผ่าน |
| `schedule-regression-test.mjs` | ผ่าน: normal, adjacent, ACK release, duplicate guard, delete ordering, cross-midnight overlap, invalid HH:MM; ส่งจริงใน mock 3 คำสั่งตาม scenario |
| `firmware-logic-regression-test.mjs` | ผ่าน: timer expiry, active schedule, outside schedule, cross-midnight, Emergency, OTA และ invalid RTC |
| `dashboard-smoke-test.mjs` | ผ่าน 81 runtime contract checks |
| `tools/mqtt_contract_audit.py` | `MQTT_CONTRACT_AUDIT_OK` |
| Firebase Database rules emulator | ผ่าน `FIREBASE_RULES_PARSED` ด้วย firebase-tools 15.28.1 |
| referenced local assets และ `icon-512.png` | ผ่าน |
| whitespace check ของไฟล์ที่แก้/เพิ่ม | ผ่าน |
| Arduino CLI compile | ผ่านด้วย `esp8266:esp8266:nodemcuv2`, core 3.1.2 และ dependency ตาม CI |

ผล resource จาก build ล่าสุด: RAM global/static `40492/80192` bytes (50%), IRAM `62099/65536` bytes (94%), flash `551768/1048576` bytes (52%). ได้ไฟล์ binary ที่ build ในเครื่อง `build-precommit/smartfarm-sketch.ino.bin` ขนาดประมาณ 582 KB, SHA-256 คือ `ea9eb6ebe1e3caf9547243073147e2fe49723d972f87561ee8faf8244b6ddbc8`

## ข้อจำกัดและสิ่งที่ยังต้องตรวจหลัง push

การทดสอบทั้งหมดข้างต้นเป็น static, deterministic host-model, rules emulator และ real compile ใน sandbox; **ยังไม่ได้ทดสอบบนบอร์ด ESP8266 จริงหรือ broker จริงในรอบนี้** จึงยังไม่อ้างว่าได้ยืนยัน electrical relay pulse, RTC hardware read, retained-message timing หรือ Wi-Fi/MQTT timing บนสนามจริงแล้ว

หากผล local validation ยังคงผ่าน ขั้นตอนถัดไปจึงค่อย commit/push เฉพาะ source, tests, workflow และเอกสารที่เกี่ยวข้อง โดยไม่รวม `.bin`, mockup, cache และ artifact ที่ไม่ใช่ source จากนั้นตรวจ GitHub Quality workflow และ Pages ให้ได้ผลสำเร็จจริงก่อนรายงานสถานะสุดท้าย

## สิ่งที่ไม่เปลี่ยน

- MQTT broker, TLS/WSS, credentials flow, base topic และ topic names
- ไม่มี forced 30-minute pump cutoff
- Emergency Stop latch และ OTA safe state
- Firebase rules และ Admin permissions
- Ivory Forest/theme redesign ซึ่งแยกออกจาก reliability patch รอบนี้
- ไม่มีการแฟลชบอร์ดหรืออ้างผล hardware-in-the-loop โดยไม่มีหลักฐานจริง
