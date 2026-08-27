# Smart Farm V7.x Full Audit Findings

## Scope
ตรวจ repository `klanarong156-pixel/New140869` บน `main` commit `9a9dc93` ตามข้อกำหนดในไฟล์แนบ โดยต้องรักษา MQTT broker/WSS URL, topics, Firebase Auth, credential flow, relay IDs และ OTA transport เดิม และ **ไม่เพิ่ม forced pump cutoff 30 นาที**.

## Findings confirmed from source

| Area | Current finding | Planned action |
| --- | --- | --- |
| Admin access | `access.js` มี `requireAdmin()` แต่หน้า settings, OTA, admin และ Firebase setup ยังไม่ได้ประกาศ `data-admin-required` อย่างครบถ้วน | เพิ่ม page-level admin gate ผ่าน `access.js` โดยไม่เปลี่ยนหน้า user ทั่วไป |
| Firebase rules | rules ครอบคลุม roles/users/finance แบบจำกัด และยังไม่ validate profile, cropCycle, cropPlots, cropReminders และ analytics | เพิ่ม per-user path rules และ validation ตาม live data model; คง role bootstrap และ admin permissions |
| Finance XSS | `finance.js` และ account renderer มี dynamic HTML; printable fallback ใช้ `document.write` | เปลี่ยนเป็น `createElement`/`textContent` และ DOM printable report |
| Version drift | `SYSTEM_VERSION.txt`, legacy docs และบาง HTML ยังระบุ V6/V7.0 และชื่อ project เก่า | สร้าง source-of-truth version และ sync active docs; archive/delete legacy only after reference audit |
| Firmware | รุ่นล่าสุดมี Telegram bounded queue, OTA relay safe state และ heartbeat diagnostics แล้ว แต่ยังใช้ `setInsecure()` และ timer arithmetic ต้องตรวจ overflow | ไม่เปลี่ยน TLS transport โดยไม่มี live certificate/memory validation; แก้ timer overflow/validationแบบ backward-compatible |
| Emergency Stop | Dashboard ส่ง OFF ทั้ง 4 relay แต่ยังเป็น one-shot MQTT command ไม่ใช่ firmware safety latch และไม่ใช่ physical E-stop | คงการสื่อสารตามจริง; พิจารณา additive latch เฉพาะเมื่อไม่กระทบ existing contract และแยกคำเตือน hardware |
| Weather | weather protection เป็น advisory/dashboard guard ไม่ใช่ firmware weather automation | ตรวจ stale timestamp/API failure ให้ fail-open เฉพาะส่วน advisory และไม่สั่ง pump ON จาก weather failure |
| Legacy | `app-v62.js`, `script.js`, `stock.js`, `schedule-fix.js`, `backup.js`, `modern-ui.css`, `style.css` เป็นผู้สมัคร legacy แต่ `page-nav.js` ยังอ้าง `modern-ui.css` | ไม่ลบจนกว่าตรวจ reference ครบ; แยก archive เฉพาะไฟล์ที่ไม่ถูกใช้งานจริง |
| PWA | service worker ใช้ cache name `smartfarm-v7-app-8` และ active asset list; `SYSTEM_VERSION.txt` ล้าสมัย | sync version/cache metadata และตรวจ offline/online update path |

## Release constraints

การ compile และการทดสอบบนบอร์ดจริงเป็นคนละเรื่องกัน โดยต้องสร้าง artifact จาก source ปัจจุบันและส่งให้ผู้ใช้ทดสอบ relay, MQTT/Wi-Fi, DHT11, RTC, Telegram, OTA และ physical E-stop/contactor ด้วยตนเองก่อนใช้งานโหลดปั๊มจริง.

> การไม่กำหนด hard cutoff 30 นาทีหมายถึงปั๊มทำงานตามตารางหรือคำสั่งที่ผู้ใช้เลือก ไม่ใช่การยืนยันว่าปั๊มสามารถทำงานโดยไม่มีอุปกรณ์ป้องกันทางไฟฟ้า.

## Baseline

- Local baseline smoke test: 57 checks passed.
- Local field-stability firmware compile: RAM 49%, IRAM 94%, Flash 52%.
- Current main commit before this audit: `9a9dc93`.
