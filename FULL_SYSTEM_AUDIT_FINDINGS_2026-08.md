# Smart Farm Full-System Audit — 2026-08

## ขอบเขต

ตรวจ source ปัจจุบันของ Dashboard/PWA, MQTT handler และ SharedWorker, Firmware ESP8266, Schedule/Timer/Relay, RTC, OTA, Emergency Stop, Telegram/Reminder, AI Rule Engine, Firebase rules/functions, MQTT contract และ quality workflow โดยยึดข้อกำหนดเดิมว่าไม่เปลี่ยน broker, TLS/WSS architecture, credentials flow, base topic, topic เดิม หรือเพิ่ม forced pump cutoff 30 นาที

## Baseline ที่ตรวจแล้ว

| รายการ | ผล baseline |
|---|---|
| Firmware source | 2,049 บรรทัด, compile ด้วย ESP8266 core 3.1.2 ผ่านก่อนรอบแก้ล่าสุด |
| JavaScript syntax | ผ่านทุกไฟล์ active JS/MJS ที่ตรวจ |
| Dashboard smoke/contract | ผ่าน 85 checks ก่อนเพิ่ม rule check |
| Schedule regression | ผ่าน normal/adjacent/cross-midnight/invalid-time/duplicate publish |
| Firmware host model | ผ่าน timer expiry, schedule priority, Emergency/OTA safety cases |
| AI advisor regression | ผ่าน rule, cooldown, payload และ no-relay-command cases |
| MQTT contract | ผ่าน และ AI alert แยกจาก Relay |
| HTML IDs | ไม่พบ duplicate IDs ใน active HTML |
| Working tree | มี binary/mockup/build artifacts untracked เดิม ต้องไม่รวมใน commit |

## Findings และสถานะ

| ID | Severity | Finding | หลักฐาน | Action/Acceptance |
|---|---|---|---|---|
| F-01 | High | `ai-farm-advisor.js` บันทึก `farm/aiAdvisor` แต่ rules เดิมไม่มี validation เฉพาะ path นี้ ทำให้การบันทึกประวัติอาจถูกปฏิเสธหรือไม่มี schema boundary | `ai-farm-advisor.js` lines 42–59; `firebase.rules.json` เดิมไม่มี `aiAdvisor` | เพิ่ม validation ของ snapshot/history/findings และให้ `firebase.rules.json` กับ `database.rules.json` เหมือนกัน; rules JSON และ emulator ต้องผ่าน |
| F-02 | Medium | `saveSecrets()` เดิมไม่ตรวจ file open/serialize result แต่ caller รายงานบันทึกสำเร็จได้แม้ persistence ล้มเหลว | Firmware `saveSecrets()` เดิม lines 570–585 และ callers ใน setup/config | เปลี่ยนเป็น bool, ตรวจ overflow/open/bytes และ rollback Telegram credentials เมื่อเขียนไม่สำเร็จ; compile และ regression ต้องผ่าน |
| F-03 | Low | MQTT control logs บางจุดใช้ `\\n` จึงแสดง backslash-n ใน Serial Monitor แทน newline จริง | Firmware MQTT callback lines 1380–1450 | แก้เฉพาะ log; เหลือ escaped `\\n` เฉพาะการ parse response ที่ต้องการ literal escape |
| F-04 | Medium / accepted limitation | Telegram reminder และ Telegram test ใช้ HTTP request แบบ synchronous ใน loop/callback จึงอาจบล็อก loop ตาม network timeout | Firmware `runReminderTask()` และ `config/telegram/test` | ยังไม่เปลี่ยนในรอบนี้ เพราะการย้ายเป็น queue ต้องออกแบบ state/ack ของ reminder ไม่ให้ mark sent หลอก; ต้องทดสอบบนบอร์ดจริงก่อนเปลี่ยน |
| F-05 | Medium / accepted limitation | TLS client ใช้ `setInsecure()` สำหรับ Telegram และ MQTT diagnostic; ลดการยืนยัน certificate | Firmware Telegram/MQTT diagnostic paths | ไม่เปลี่ยนโดยเดา CA เพราะอาจทำให้ HiveMQ/Telegram ใช้งานไม่ได้และกระทบ memory; ต้องมี CA rotation/test บน hardware เป็นงานแยก |
| F-06 | Medium / deferred by user | Firebase Functions ยังไม่มี MQTT collector หรือ Scheduler ดังนั้น AI จะไม่ทำงานเมื่อปิด Dashboard | `functions/index.js` มีเฉพาะ user-management callable functions; telemetry ปัจจุบันเขียนเมื่อ Dashboard เปิด | ผู้ใช้สั่งให้พักงาน backend ไว้ก่อน; ไม่แก้ในรอบนี้ และห้ามรายงานว่า offline analysis พร้อมใช้งาน |
| F-07 | Low | Service Worker ใช้ cache asset list แบบ static; การเพิ่มไฟล์ใหม่ต้อง bump cache และเพิ่ม asset ทุกครั้ง | `sw.js` `CACHE_NAME` และ `APP_SHELL` | ตรวจ asset/version ใน smoke suite; หากแก้ active asset ต้องเพิ่ม cache entry และ bump version |
| F-08 | Low | มีไฟล์ binary/mockup/build artifact untracked จำนวนมาก | `git status --short` | ไม่ลบผู้ใช้ ไม่ stage และไม่รวมใน commit; source-only commit เท่านั้น |

## Acceptance criteria รอบนี้

1. Firmware ต้อง compile จริงด้วย `esp8266:esp8266:nodemcuv2`, core 3.1.2 และ dependencies ตาม workflow
2. Dashboard, schedule, firmware-model และ AI regression ต้องผ่านทั้งหมด
3. Firebase rules JSON ต้อง parse ได้, twin ต้อง identical และ emulator/rules check ต้องผ่าน
4. ต้องไม่เพิ่ม Relay publisher ใน AI module และ AI alert topic ต้องไม่ overlap กับ Relay command topic
5. Emergency Stop และ OTA ต้องยังบังคับ Relay OFF และ schedule/timer ต้องไม่ข้าม safety latch
6. ต้องไม่มี `30-minute` forced cutoff ใน Firmware
7. ต้องไม่ stage binary, mockup, build output หรือ secret
8. ข้อจำกัดที่ยังไม่ได้ทดสอบบน hardware/broker จริงต้องรายงานแยกอย่างชัดเจน

## รอบแก้ที่ดำเนินการแล้วใน working tree

- เพิ่ม `aiAdvisor` validation ใน Firebase rules ทั้งสองไฟล์
- เปลี่ยน Firmware `saveSecrets()` ให้คืนผลสำเร็จจริงและ rollback Telegram credentials เมื่อ persistence ล้มเหลว
- แก้ MQTT Serial log newline ที่ผิดรูปแบบ

ยังไม่มี commit หรือ push สำหรับการแก้รอบนี้จนกว่าจะผ่าน full validation รอบใหม่

## ผล validation หลังแก้

| Test | Result |
|---|---|
| JavaScript syntax รวม `functions/index.js` | PASS |
| Dashboard smoke/contract | PASS — 88 checks |
| Schedule regression | PASS |
| Firmware logic regression | PASS |
| AI advisor regression | PASS |
| MQTT contract audit | PASS |
| Firebase rules JSON และ twin | PASS — `FIREBASE_RULES_JSON_AND_TWIN_OK` |
| Whitespace | PASS |
| Real Firmware compile | PASS — ESP8266 core 3.1.2 / NodeMCU v2 |

Firmware resource result: RAM 50%, IRAM 94%, flash 52%. Final compiled binary SHA-256 from `/tmp/smartfarm-final-audit-build/smartfarm-final-audit-sketch.ino.bin`: `7ab345e69f5b2e84b591e4f33b096c79a632c0e95e85a9517b74adbaf2b1596a`.

The compiler emits two non-fatal Python `SyntaxWarning` messages from the ESP8266 core's `elf2bin.py`; compilation exits successfully. No hardware-in-the-loop test was performed, so relay electrical behavior, real RTC module, broker delivery and Telegram delivery remain field-test items.

## Release decision

The proven fixes in F-01, F-02 and F-03 pass local validation and are eligible for a source-only commit. F-04, F-05 and F-06 remain explicitly accepted/deferred limitations and are not represented as solved. Binary files, mockups and prior build artifacts remain untracked and excluded from the release commit.
