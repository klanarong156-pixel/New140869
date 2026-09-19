# รายงานตรวจสอบ Smart Farm ครบทุกหน้า

**วันที่ตรวจสอบ:** 17 กันยายน 2026  
**Repository:** `klanarong156-pixel/New140869`  
**Revision ที่ตรวจ:** `cb9f7b59d3651bad6e003b3c3e1b4f30134436cf`  
**ขอบเขต:** HTML ระดับ root ครบ 17 หน้า รวม JavaScript, CSS, Firebase Rules, Cloud Functions, Service Worker และ firmware ที่หน้าเว็บอ้างอิง  
**สถานะการแก้ไข:** รายงานนี้เป็นการตรวจและวิเคราะห์เท่านั้น ไม่มีการแก้ source production และไม่มีการ push commit

## บทสรุปผู้บริหาร

ระบบมีพื้นฐานที่แข็งแรงกว่าที่เห็นจากการตรวจหน้าเว็บเพียงอย่างเดียว โครงสร้าง Firebase แยกข้อมูลตามผู้ใช้ มีการตรวจสิทธิ์ admin ซ้ำใน Cloud Functions มีการยืนยันสถานะ relay จากอุปกรณ์ และชุด regression test/CI ผ่านทั้งหมดใน revision ที่ตรวจ อย่างไรก็ตาม ผลตรวจพบปัญหาที่ควรแก้ก่อนใช้งานจริงในภาคสนาม โดยเฉพาะส่วนที่เกี่ยวกับ **ความปลอดภัยของการควบคุมอุปกรณ์, ความถูกต้องของข้อมูล, และการสื่อสารสถานะต่อผู้ใช้**

ประเด็นที่มีความเสี่ยงสูงสุดคือ firmware ใช้ `setInsecure()` จึงเข้ารหัส MQTT แต่ไม่ตรวจว่า server เป็น broker ตัวจริง, OTA ส่ง Basic Authentication ผ่าน HTTP, credential MQTT ถูกเก็บใน browser storage และ subscribe ด้วย wildcard `smartfarm/#`, ขณะที่หน้า Settings/OTA ใช้ client-side admin gate เป็นหลัก นอกจากนี้ข้อมูล `cucumberSales` ยังไม่มี Firebase Rules validation เฉพาะ path และหน้า Finance มีโมดูลที่เริ่มทำงานก่อน `access:ready` จึงมีโอกาสเกิด race condition ตอน session กำลัง refresh

ยังพบความคลาดเคลื่อนระหว่างเอกสารกับระบบจริงหลายจุด เช่น เอกสาร HTML ระบุว่า mode topics ไม่ active แต่ firmware และ Markdown contract ยืนยันว่า AUTO/MANUAL ยัง active, หน้า Hardware ระบุชื่อไฟล์ firmware ไม่ตรงกับไฟล์จริง, README ระบุ information architecture ของ Dashboard ไม่ตรงกับ DOM ปัจจุบัน และหน้า Settings มีลิงก์ไปยัง anchor ที่ไม่มีอยู่จริง ปัญหาเหล่านี้ไม่ทำให้ CI ปัจจุบันล้มเหลวเสมอไป แต่สามารถทำให้ผู้ปฏิบัติงานใช้ระบบผิดวิธีได้

ในด้านคุณภาพการใช้งาน หน้าเอกสารมี H1 ซ้ำและ code block สีอ่อนมากจน contrast โดยประมาณอยู่ที่ **1.13:1–1.24:1** บนพื้นหลังสว่าง ซึ่งต่ำกว่าระดับที่เหมาะสมสำหรับข้อความปกติอย่างมาก กราฟ canvas ไม่มีข้อมูลทางเลือกสำหรับ screen reader, หลายชุดปุ่มประกาศเป็น tablist แต่ไม่มี ARIA tab semantics, และหลายหน้าขาด loading/error/empty state ที่ชัดเจน

**ไม่พบหลักฐานจากการตรวจครั้งนี้ว่าผู้ใช้ทั่วไปสามารถข้าม Firebase Rules หรือ server-side `requireAdmin` เพื่อจัดการผู้ใช้อื่นได้โดยตรง** แต่การพึ่งพา client-side gate ใน flow OTA และ Settings ยังไม่เหมาะสม เพราะการซ่อนหน้าและการ redirect ไม่ใช่ authorization boundary ที่เชื่อถือได้

## ระดับความเร่งด่วน

| ระดับ | ความหมายในการจัดลำดับ | จำนวนประเด็นหลักโดยประมาณ |
| --- | --- | ---: |
| **สูง** | มีโอกาสกระทบการควบคุมอุปกรณ์, credential, firmware, หรือความถูกต้องของข้อมูลโดยตรง ควรแก้ก่อนใช้งานจริง | 9 |
| **กลาง** | กระทบความน่าเชื่อถือของข้อมูล, lifecycle, error recovery หรือการใช้หน้าจริง ควรแก้ในรอบถัดไป | 17 |
| **ต่ำ** | กระทบ accessibility, performance, consistency หรือ maintenance แต่ยังไม่ใช่เหตุให้ระบบหยุดทำงานทันที | หลายรายการ |
| **ข้อมูลยืนยันเชิงบวก** | ไม่พบปัญหาในขอบเขตที่ตรวจ เช่น broken asset, syntax error หรือ server-side role check | หลายรายการ |

ยังไม่มีประเด็นที่จัดเป็น **Critical** จากหลักฐานใน revision นี้ เนื่องจากไม่พบการยืนยันว่ามีการเปิดข้อมูล Firebase ข้ามผู้ใช้หรือเปิด callable admin ให้ user ทั่วไปเรียกได้โดยตรง อย่างไรก็ตามประเด็นระดับสูงด้าน TLS, OTA และ MQTT credential ควรถือเป็น blocker ก่อนนำระบบไปควบคุมอุปกรณ์ในเครือข่ายที่ไม่น่าเชื่อถือ

## สิ่งที่ตรวจแล้วผ่าน

การตรวจ static พบว่า HTML ระดับ root ทั้ง 17 หน้าตอบกลับด้วย HTTP `200` จาก local server และไฟล์ที่หน้าเว็บอ้างอิงในชุดหลักมีอยู่ใน repository การตรวจ runtime เบื้องต้นพบว่าเมื่อเปิด Dashboard โดยไม่มี session ระบบ redirect ไป `auth.html?next=index.html` ตามที่คาดไว้ หน้า Auth แสดง label ของ email/password ครบ และไม่พบ console error ในรอบตรวจที่ทำกับหน้าดังกล่าว

การตรวจ syntax ผ่านสำหรับ JavaScript หลักและ Cloud Functions ชุด regression test ผ่านทั้ง dashboard contract, schedule, usage calculation, AI advisor, firmware logic, E2E navigation, MQTT contract audit, Firebase Rules twin และ lint ของ Functions ล่าสุด GitHub Actions ของงาน Validate Smart Farm integration และ Smart Farm quality ก็ผ่านครบทั้ง browser/static checks, Firebase Rules parsing, Cloud Functions quality และ ESP8266 build [7] [8]

อย่างไรก็ตาม CI ปัจจุบันยังเน้น static/contract/regression test มากกว่าการทดสอบระบบปลายทางจริง ยังไม่มีการยืนยัน broker/device แบบ live, Firebase project ที่ deploy จริง, OTA กับฮาร์ดแวร์จริง, visual regression, screen reader และ mobile viewport ทุกหน้าจอ จึงไม่ควรตีความว่า CI ผ่านแล้วเท่ากับระบบพร้อมใช้งานภาคสนามทุกเงื่อนไข

## ประเด็นที่ควรแก้ก่อนใช้งานจริง

### 1. Firmware ไม่ตรวจสอบตัวตนของ MQTT broker — ระดับสูง

`SmartFarm_V6_PRODUCTION1.ino` เรียก `tls.setInsecure()` และเอกสาร contract ยอมรับว่าการเชื่อมต่อถูกเข้ารหัสแต่ไม่ได้ตรวจสอบ certificate ของ server [3] [4] ผู้โจมตีที่อยู่ในเส้นทางเครือข่ายอาจปลอม broker, ดัก credential หรือส่งคำสั่งควบคุมไปยังอุปกรณ์ได้ แม้ข้อมูลจะเดินทางผ่าน TLS ก็ตาม

ควรเปลี่ยนเป็นการตรวจ CA/certificate ที่เหมาะสมกับ ESP8266 และวางแผนการหมุน certificate ก่อนหมดอายุ จากนั้นเพิ่ม CI assertion ที่ห้าม `setInsecure()` ใน production path และเพิ่ม deployment test ที่ยืนยันว่าอุปกรณ์ปฏิเสธ broker ที่ certificate ไม่ถูกต้อง เอกสารต้องระบุสถานะ mitigation อย่างตรงไปตรงมา ไม่ใช่เพียงบอกว่าการเข้ารหัสมีอยู่

### 2. OTA ส่ง Basic Authentication ผ่าน HTTP — ระดับสูง

ทั้ง `ota.html` และ `ota-standalone.html` ส่ง `Authorization: Basic ...` ไปยัง ESP8266 ผ่าน `http://` ใน LAN โดย Basic Authentication เป็นเพียงการ encode ไม่ใช่การเข้ารหัส ผู้ที่ดักทราฟฟิกใน Wi-Fi เดียวกันอาจกู้รหัส `ota_pass` แล้วอัปโหลด firmware ที่เป็นอันตรายหรือเข้าถึง status endpoint ได้ [4]

หาก ESP8266 ไม่เหมาะกับ TLS ควรบังคับให้ใช้งานผ่าน VPN หรือ management gateway ที่เข้ารหัสและจำกัดเครือข่าย แทนการให้ผู้ใช้ส่งรหัสผ่านตรงผ่าน HTTP หน้า OTA ต้องมีคำเตือนที่เห็นชัดว่า password เดินทางแบบ plaintext และห้าม port-forward endpoint ออกอินเทอร์เน็ต ระยะยาวควรพิจารณา signed firmware และ gateway ที่ตรวจสอบผู้ปฏิบัติงานก่อน forward คำขอ

### 3. MQTT credential อยู่ใน browser storage และ subscription กว้างเกินไป — ระดับสูง

หน้า Dashboard เก็บ ID/password ของ MQTT ใน `sessionStorage` เป็นค่าเริ่มต้น และเปิดทางให้ผู้ใช้เลือกจำไว้ใน `localStorage` ขณะเดียวกัน `config.js` ใช้ subscription filter `smartfarm/#` ซึ่งทำให้ credential ชุดเดียวรับข้อมูลทุก topic ใต้ prefix รวมถึง topic ที่เกี่ยวข้องกับ control และ configuration [1] [2]

ควรคง session-only เป็นค่าเริ่มต้นและหลีกเลี่ยงการจำ password ของบัญชี admin แบบถาวร ออกแบบ HiveMQ ACL แยกบัญชี read-only, dashboard operator และ device ให้ publish/subscribe เฉพาะ topic ที่จำเป็น เช่น แยก relay command, status, emergency และ Telegram configuration ออกจากกัน หากเป็นไปได้ควรใช้ credential อายุสั้นหรือ broker-issued credential แทน shared password และไม่ถือว่า Firebase login ทำให้ MQTT authorization ปลอดภัยโดยอัตโนมัติ

### 4. หน้า Settings และ OTA ใช้ client-side admin gate เป็นหลัก — ระดับสูง

`settings.html` และ `ota.html` ระบุ `data-admin-required="true"` แต่ script ที่ผูก OTA และ Telegram ทำงานก่อน event `access:ready` และ `dashboard-ota.js` ไม่มีการตรวจ role ก่อนผูกหรือเปิดการส่งคำขอ การ redirect ผู้ใช้ทั่วไปหลังตรวจ role เป็นเพียง UX gate ไม่ใช่การป้องกันคำสั่งที่เชื่อถือได้

ควรแยกการเริ่มต้นหน้าเป็นสองระยะ ได้แก่ตรวจ session/role ให้เสร็จก่อน แล้วจึงเปิด form และผูก event ที่มีผลข้างเคียง ทุกคำสั่งสำคัญต้องมี authorization ซ้ำที่ trusted boundary เช่น broker ACL, gateway หรืออุปกรณ์ ไม่ควรพึ่งการซ่อนปุ่มหรือการ redirect ฝั่ง browser โดยเฉพาะ OTA ซึ่งมีผลต่อ firmware

### 5. Firebase Rules ไม่มี validation เฉพาะ `cucumberSales` — ระดับสูง

หน้า Finance เขียนข้อมูลที่ `users/{uid}/cucumberSales/{id}` แต่ Rules ที่ตรวจพบมี validation ชัดเจนสำหรับ finance และ path อื่น ไม่ได้บังคับ schema, ชนิดข้อมูล, ขนาด หรือช่วงค่าของ cucumber sales โดยตรง ผู้ใช้ที่ผ่าน auth จึงอาจเขียน payload ที่ผิดรูปแบบผ่าน REST ได้ แม้ UI จะ normalize ข้อมูลฝั่ง client [5]

ควรเพิ่ม `.validate` ใต้ `cucumberSales/$id` ให้บังคับวันที่, น้ำหนักรวม, น้ำหนักแต่ละเกรด, note, createdAt, ความยาว string และช่วงค่าที่สมเหตุสมผล หากต้องบังคับผลรวมของเกรด ควรตรวจใน Rules หรือ trusted backend ด้วย และควรเพิ่ม emulator test สำหรับ payload ติดลบ, field แปลกปลอม, string ยาวเกิน, UID อื่น และการลบข้อมูล

### 6. Cucumber Sales เริ่มทำงานก่อน auth พร้อม — ระดับสูง

`cucumber-sales-ui.js` query DOM และเรียก refresh ทันทีที่ script ถูกประเมิน ขณะที่ `access.js` ทำ session refresh และ dispatch `access:ready` แบบ asynchronous ต่างจาก `finance.js` ที่รอ event ดังกล่าว ความแตกต่างนี้ทำให้ session ที่กำลัง refresh หรือหมดอายุอาจทำให้ข้อมูล cucumber โหลดด้วย token เก่า/ไม่มี user และเกิดสถานะผิดพลาดจนต้อง reload

ควรสร้าง shared auth-ready bootstrap ให้โมดูลทุกตัวเริ่มทำงานหลัง access พร้อมเท่านั้น ระหว่างรอต้อง disable form และแสดง loading state เมื่อ error ต้องแสดง retry ที่มีความหมาย ไม่ควรให้แต่ละโมดูลเดาเองว่า auth พร้อมแล้วหรือยัง

### 7. Real-time MQTT viewer ไม่บังคับ `wss://` — ระดับสูง

`realtime-mqtt.html` ให้ผู้ใช้กรอก URL เองและส่งค่าไป `mqtt.connect()` โดยไม่ได้ตรวจ protocol แม้เอกสารระบบระบุว่าต้องใช้ secure WebSocket หากผู้ใช้กรอก `ws://` credential อาจถูกส่งผ่านการเชื่อมต่อที่ไม่เข้ารหัส [1]

ควรตรวจว่า URL เป็น `wss:` และอยู่ใน allowlist ของ broker ก่อน connect หากหน้ามีหน้าที่รับข้อมูลจาก broker เดียวควรตรึง host/path ไม่ให้กรอก endpoint อิสระ การ subscribe ที่ล้มเหลวควรเปลี่ยนสถานะเป็น error, ปิด client และเปิดปุ่ม Connect กลับ ไม่ควรปล่อย UI ค้างอยู่ในสถานะกำลังเชื่อมต่อ

## ผลตรวจรายหน้าทั้ง 17 หน้า

### ตารางสรุปตามหน้า

| หน้า | สถานะโดยรวม | ประเด็นหลักที่ควรปรับปรุง |
| --- | --- | --- |
| `index.html` | ใช้งานได้ แต่เป็นจุดรวมความเสี่ยงหลัก | MQTT storage/ACL, README ไม่ตรงกับ DOM, canvas ไม่มี alternative data, script และฟอนต์โหลดแบบ blocking |
| `schedule.html` | ฟังก์ชันหลักมี regression รองรับ แต่ lifecycle ยังไม่แน่น | ขาด STEP 2, tab ไม่มี ARIA, ยอมรับวันที่ปฏิทินปลอม, reminder แสดงว่าส่งสำเร็จแม้ MQTT ไม่พร้อม, bind ก่อน auth พร้อม |
| `finance.html` | โครงสร้างดี แต่ข้อมูลผลผลิตยังไม่ปลอดภัยพอ | `cucumberSales` ไม่มี Rules validation, Cucumber UI เริ่มก่อน auth, jsPDF CDN ไม่มี SRI, grade fields/status ขาด semantics |
| `account.html` | การแยกข้อมูลตามผู้ใช้สอดคล้องกับ Rules | Firebase init failure ทำให้ค้าง loading, validation ไม่ผูกกับ field, ตารางและปุ่มลบขาดบริบทสำหรับ screen reader |
| `settings.html` | ข้อมูลหลักตรงกับ README แต่ขอบเขตหน้าใหญ่เกินไป | admin gate ฝั่ง client, broken anchor `#crop-reminders`, OTA URL อิสระ, Telegram Chat ID ตรวจไม่พอ, import backup ไม่มี preview/rollback |
| `admin.html` | server-side admin check ทำงานตามแบบที่คาด | ไม่มี pagination หลัง 1,000 users, error/empty state แยกไม่ชัด, ตารางขาด caption/scope, mobile nav ยังไม่ชัด |
| `ota.html` | ใช้งานได้เมื่ออุปกรณ์ตอบ แต่เสี่ยงด้าน security/reliability | Basic Auth ผ่าน HTTP, admin gate ก่อน access ready, ไม่มี timeout/cancel/กัน submit ซ้ำ, progress ไม่มี accessible name |
| `auth.html` | flow พื้นฐานทำงานและไม่มี selector หลักเสีย | refresh token อยู่ localStorage, tablist ไม่มี tab semantics, ไม่มี aria-busy/field error, CSS auth ซ้อนหลายชั้น |
| `404.html` | เรียบง่ายและทำหน้าที่ได้ดี | โหลด `app.css` ใหญ่เกินจำเป็น, CSS ซ้ำ; โครงสร้าง semantic และ responsive พื้นฐานถือว่าดี |
| `HARDWARE_V6.html` | pin map หลักตรงกับ firmware ส่วนใหญ่ | ชื่อ firmware ผิด, ขาด D1 Wi-Fi reset, ตารางขาด caption/scope, icon เตือนไม่ซ่อนจาก screen reader |
| `MQTT_CONTRACT_V6.html` | เอกสารอ่านได้ แต่เป็นจุด contract drift | mode statement ขัดกับ firmware/Markdown, setInsecure, public docs ไม่ใช่ auth boundary, H1 ซ้ำ, contrast ต่ำ, ไม่มี TOC |
| `firebase-setup.html` | เนื้อหาหลักถูกต้องและไม่พบ secret เพิ่ม | anchor-js ไม่มี fallback, layout class ไม่มี CSS, H1 ซ้ำ, homepage hard-code, `og:locale` ไม่ตรงภาษา |
| `mqtt-status-demo.html` | เป็น simulator ที่แยกจาก production | drop state ถูกวาดเป็น connected, reset ไม่ยกเลิก ACK timer, log ใช้ถ้อยคำเหมือน broker จริง, mobile grid/focus ยังไม่ดี |
| `dashboard-vintage-example.html` | เป็น mockup ไม่ใช่ production dashboard | ตัวเลข/วันที่ hard-coded, ปุ่ม forecast ไม่ทำงาน, toggle เปลี่ยนภาพแต่ข้อความยังบอกปิด, ไม่มี focus และซ่อน nav บนมือถือ |
| `control-button-options.html` | เป็น static design mockup | ข้อความสัญญาว่าเลือก 1–5 แล้วนำไปใช้จริงแต่ไม่มี interaction, status ไม่มี semantics, ไม่มี focus style, Google Fonts เป็น dependency ภายนอก |
| `realtime-mqtt.html` | read-only viewer มี purpose ชัด แต่ไม่ปลอดภัยพอ | ไม่บังคับ wss, subscribe failure ทำ UI ค้าง, ไม่ใช้ form semantics/native validation, live status/log ไม่ประกาศ, render ทุก message ทำให้กระตุก |
| `ota-standalone.html` | ช่วยแก้ mixed content ได้ แต่การส่ง credential ยังเสี่ยง | Basic Auth ผ่าน HTTP, CORS firmware เป็น wildcard, XHR ไม่มี timeout, ไม่ตรวจ size/type ของ firmware, 2xx ไม่ได้ยืนยัน post-reboot state |

### รายละเอียดที่ควรแก้เฉพาะหน้า

#### `index.html` — Dashboard

Dashboard มีการรอ status confirmation ของ relay และมี health panel ที่ดี แต่ README ระบุว่า Dashboard ไม่แสดง schedule/safety/system summary ซ้ำ ขณะที่ DOM ปัจจุบันมีส่วนเหล่านี้อยู่แล้ว จึงควรเลือกให้ชัดว่าจะยึด DOM หรือแก้ README [2] หากต้องการแสดง schedule summary จริงควรเพิ่ม selector `[data-dashboard-schedule-list]` ให้ตรงกับ `app.js`; หากไม่ต้องการควรลบ dead rendering path และ section ที่ไม่อยู่ใน IA

กราฟ `canvas#sensorHistoryChart` มีเพียง `aria-label` แต่ไม่มีตารางหรือรายการข้อมูลทางเลือก ทำให้ผู้ใช้ screen reader เข้าถึง trend ไม่ได้ ควรเพิ่ม summary ล่าสุด/ต่ำสุด/สูงสุดและรายการตามเวลาแบบ visually hidden หรือ data table ที่อัปเดตพร้อมกราฟ นอกจากนี้ควรพิจารณาแบ่ง bundle ตามโหมด Simple/Advanced และใช้ `defer` กับ script ที่รักษาลำดับ dependency ได้ เพื่อปรับปรุง first render บนมือถือ

#### `schedule.html` — Automation และ crop workflow

หน้าอ้าง `AUTOMATION · STEP 1–3` แต่มีหมายเลข 1 และ 3 โดยไม่มี 2 ควรแก้ copy หรือเพิ่มขั้นตอนที่หายไป ชุดปุ่มเลือก relay ใช้ `role="tablist"` แต่ไม่มี `role="tab"`, `aria-selected` หรือ `tabpanel` จึงควรเลือกว่าจะทำ tab pattern ให้ครบ หรือเปลี่ยนเป็นชุดปุ่มธรรมดาที่ใช้ `aria-pressed`

ฟังก์ชันตรวจวันที่ยืนยันเพียง regex และ `Date.getTime()` ซึ่งยอมให้วันที่อย่าง 2024-02-31 ถูกปรับเป็นวันอื่นโดย JavaScript ควรตรวจ round-trip ปี/เดือน/วันก่อน persist ทุกชั้น อีกประเด็นคือ `publish()` ของ reminder คืน `false` เมื่อ MQTT offline แต่ flow บันทึกยังแสดง success ว่าส่งไป ESP8266 แล้ว ควรแยกสถานะ local/cloud/device ให้ผู้ใช้ทราบว่าอะไรสำเร็จจริง

#### `finance.html` — Finance และ Cucumber Sales

นอกจาก ledger แล้วหน้านี้ยังเป็นทะเบียนผลผลิตแตงกวา แต่ README ยังไม่ระบุ module และ data path นี้ ควรอัปเดตเอกสารหรือแยกเป็นหน้าที่ชัดเจน ช่องน้ำหนักแต่ละเกรดควรใช้ `fieldset/legend` และ status ควรเป็น `role="status" aria-live="polite"` เพื่อให้ผลบันทึก/validation ถูกประกาศ

การลบรายการการเงินมี confirmation แต่ยังไม่มี edit, undo หรือ audit trail การใช้ soft-delete จะเหมาะกว่าในข้อมูลทางการเงินที่อาจต้องตรวจสอบย้อนหลัง สำหรับ PDF ควร vendor jsPDF หรือเพิ่ม SRI และกำหนด CSP เนื่องจากหน้า authenticated มีข้อมูลการเงินและ Firebase session context

#### `account.html` — Profile และ finance summary

กฎ Firebase จำกัดข้อมูลตาม UID ได้ถูกทิศทางและไม่พบหลักฐาน cross-user access จาก static review ปัญหาหลักคือหาก Firebase script โหลดไม่สำเร็จหรือ access initialization ไม่จบ หน้าอาจค้างข้อความ “กำลังโหลด” โดยไม่มี retry/error state ควรเพิ่ม timeout state และปุ่มลองใหม่

ปุ่มลบในตารางการเงินควรมี `aria-label` ที่ระบุชื่อรายการ เช่น “ลบรายการค่าปุ๋ย” และตารางควรมี `caption` กับ `scope="col"` การตรวจ profile ควรใช้ inline error ที่มี `aria-describedby` และ focus ไปยังช่องแรกที่ผิดแทนการแสดง toast อย่างเดียว

#### `settings.html` — System settings

หน้า Settings เป็นจุดที่มีความขัดแย้งระหว่าง UX กับ authorization ชัดที่สุด เพราะอยู่ในเมนูหลัก 5 รายการของผู้ใช้ทุกคน แต่ทั้งหน้าถูกตั้งเป็น admin-only ควรเลือกแนวทางใดแนวทางหนึ่งอย่างชัดเจน ได้แก่ทำ Settings เป็นหน้าผู้ใช้ทั่วไปแล้วล็อกเฉพาะ card ที่เป็น admin หรือเอาออกจากเมนูทั่วไปและเปิดผ่าน Account/Admin เท่านั้น

ลิงก์ `schedule.html#crop-reminders` ไม่มี element ที่มี id `crop-reminders` ในปลายทาง จึงควรเพิ่ม id ให้ section หรือแก้ href อีกทั้งปุ่ม OTA test ที่ `dashboard-ota.js` รองรับไม่มีอยู่ใน DOM หน้า Settings ทำให้ dead code ควรเพิ่มปุ่มหรือเอา code ออก

การ import backup เขียนหลายชุดลง localStorage/Firebase โดยไม่มี schema validation เชิงลึก, preview, snapshot ก่อนเขียน หรือ rollback เมื่อชุดใดชุดหนึ่งล้มเหลว ควรทำเป็น dry-run ก่อนและใช้ transaction/restore plan ส่วน analytics ควรแสดงให้ชัดเมื่อ Firebase โหลดไม่สำเร็จ แทนการคงค่าศูนย์หรือข้อมูลเก่าโดยไม่มีคำอธิบาย

#### `admin.html` — User management

ฝั่ง server มี `requireAdmin` และ callable action checks จึงไม่ควรลดทอนเป็นเพียง client hiding ประเด็นเชิงฟังก์ชันคือ `listUsers` รองรับ `pageToken` แต่ UI เรียกเพียงครั้งเดียว ทำให้ผู้ใช้หลังลำดับที่ 1,000 หายจากการค้นหาและการกำกับสิทธิ์ ควรเพิ่ม next-page หรือโหลดต่อจนหมด พร้อมแสดงจำนวนที่โหลดแล้ว

เมื่อ listUsers ล้มเหลว UI เปลี่ยนเพียง notice ด้านบน แต่ตารางยังดูเหมือนว่าง จึงควรแยก state loading, error และ loaded-empty ให้ชัด ตารางควรมี caption/scope และปุ่ม action ควรมี label ที่ระบุบัญชี นอกจากนี้ควรมี mobile navigation ที่ไม่ทำให้ topbar เบียดกันบน 320–414px

#### `ota.html` และ `ota-standalone.html` — Firmware update

นอกจากปัญหา Basic Auth ผ่าน HTTP แล้ว flow ทั้งสองหน้ายังขาด timeout, cancel, submit lock และ post-reboot verification `2xx` หมายถึง request ได้รับการตอบรับ ไม่ได้ยืนยันว่า ESP8266 บูต firmware ใหม่สำเร็จ ควรใช้ข้อความ “ส่งคำขอสำเร็จ รออุปกรณ์รีสตาร์ต” แล้ว polling status แบบจำกัดจำนวนครั้ง หรือบอกขั้นตอนตรวจสอบด้วยตนเองอย่างชัดเจน

Firmware เปิด CORS เป็น `*` พร้อมอนุญาต `Authorization` และใช้ endpoint update จึงควรจำกัด origin หรือปิด CORS เมื่อไม่จำเป็น การตรวจไฟล์ฝั่ง client ตรวจเพียงนามสกุล `.bin`; ควรเสริมการตรวจขนาด, target, checksum/signature แต่ยังคงให้ firmware เป็น trust boundary หลัก

#### `auth.html` — Authentication

การเก็บ ID token และ refresh token ใน localStorage ทำให้สคริปต์ที่ถูกแทรกใน origin เดียวกันอ่าน refresh token และยึด session ต่อได้ ควรพิจารณา server session ที่ใช้ HttpOnly/Secure/SameSite cookie หากสถาปัตยกรรมรองรับ หากยังใช้ localStorage ต้องลด third-party script, เพิ่ม CSP และจำกัดอายุ/การใช้งาน token ให้ชัด

ตัวสลับ Sign in/Create account ประกาศเป็น `tablist` แต่ปุ่มไม่มี `role=tab`, `aria-selected` หรือ `aria-controls` ควรทำ tab semantics ให้ครบ หรือเปลี่ยนเป็น button group ที่ใช้ `aria-pressed` นอกจากนี้ควรเพิ่ม `aria-busy`, `aria-invalid` และ field-level error

#### `MQTT_CONTRACT_V6.html`, `HARDWARE_V6.html` และ `firebase-setup.html` — เอกสารอ้างอิง

เอกสารควรใช้ single source of truth และสร้างทั้ง HTML/Markdown จากข้อมูลชุดเดียวกัน ปัจจุบัน MQTT Markdown ระบุ mode AUTO/MANUAL active แต่ HTML ระบุว่าไม่มี mode topics และ README เตือนห้ามสร้าง topic ดังกล่าว ทั้งที่ firmware รับและ publish mode จริง [2] [3] [4]

`HARDWARE_V6.html` ระบุ `SmartFarm_V6_PRODUCTION.ino` แต่ไฟล์จริงคือ `SmartFarm_V6_PRODUCTION1.ino` และตารางไม่ได้แสดง D1/GPIO5 ซึ่งเป็นปุ่ม Wi-Fi reset ใน firmware ควรเพิ่มข้อมูลนี้พร้อมคำเตือนว่าไม่ใช่ physical E-stop ตารางทุกหน้าควรมี caption และ `scope="col"`

`MQTT_CONTRACT_V6.html` และ `firebase-setup.html` มี H1 สองตัว โดย H1 แรกเป็น brand link ควรเปลี่ยนเป็น header/link และสงวน H1 เดียวสำหรับชื่อเอกสาร หน้า contract ควรใช้ `<main>`, skip link และ table of contents ส่วน code color จาก `readability-overhaul.css` ต้องเปลี่ยนทันทีเพราะ contrast ต่ำมาก

`firebase-setup.html` เรียก `anchors.add()` โดยไม่ตรวจว่า CDN script โหลดสำเร็จหรือไม่ หาก CDN ล่มจะเกิด ReferenceError แม้เนื้อหาเอกสารยังอ่านได้ ควรใช้ guard หรือ self-host dependency และควรเปลี่ยน wrapper ที่ใช้ class จาก GitHub/Jekyll เช่น `container-lg` และ `markdown-body` ให้มี CSS ที่นิยามจริงใน deployment นี้

#### `realtime-mqtt.html` และ `mqtt-status-demo.html` — เครื่องมือ MQTT

`realtime-mqtt.html` ควรจำกัด URL เป็น `wss://` และทำ form validation แบบ native โดยใช้ `<form>`, `required`, `type="url"`, `aria-describedby` และ error region การ render ทุก message ใหม่ทั้งตารางและ log อาจกระตุกเมื่อ telemetry ถี่ ควร throttle/batch และจำกัดขนาด payload ต่อ event

`mqtt-status-demo.html` เป็น simulator ที่ไม่ต่อ broker จริง แต่มี bug ที่สำคัญ: เมื่อกดจำลองหลุด ข้อความ “การเชื่อมต่อหลุด” มี substring “เชื่อมต่อ” จึงถูก paint เป็น state สีเขียว/connected อีกทั้ง reset ไม่ยกเลิก ACK timer ของคำสั่งที่กำลังรอ ทำให้หลัง reset มี callback เก่าเขียน state กลับมา ควรใช้ state machine และเก็บ timer ทุกตัวเป็นชุดเดียวกัน ถ้อยคำใน log ควรใช้ `SIMULATED_CONNECT` และ `SIMULATED_ACK` เพื่อไม่ให้สับสนกับ broker ACK จริง

#### `dashboard-vintage-example.html` และ `control-button-options.html` — Design mockups

ทั้งสองหน้าเป็น mockup ไม่ใช่ production control surface จึงควรติดป้าย “ตัวอย่างเท่านั้น” ให้ชัดเจนและไม่ให้ข้อความสร้างความคาดหวังเกินจริง `dashboard-vintage-example.html` ใช้ข้อมูล online, sensor และอายุพืชแบบ hard-coded ปุ่มดูพยากรณ์ 7 วันไม่ทำงาน และ toggle เปลี่ยนเพียง class/ARIA แต่ข้อความยังบอก “ปิดอยู่” ควรเปลี่ยนเป็น preview ที่ไม่สื่อว่าเป็นข้อมูลสด หรือเชื่อม state จริงพร้อม loading/error/stale state

`control-button-options.html` มีปุ่มตัวอย่าง 15 ปุ่ม แต่ไม่มี script, form หรือ selected state ทั้งที่ข้อความท้ายหน้าบอกให้เลือกหมายเลข 1–5 แล้วนำไปใช้จริง ควรเปลี่ยนคำอธิบายเป็น preview-only หรือเพิ่ม radio/card selection ที่เข้าถึงได้และกำหนดว่าจะส่งผลต่อ dashboard อย่างไร

#### `404.html` — Fallback

หน้า 404 เป็นหน้าที่ทำได้ดี มี main/section, h1, label ของภาพ, ลิงก์กลับ Dashboard/Auth และ responsive rule พื้นฐาน ไม่พบ script, form, selector mismatch หรือ broken asset ประเด็นที่ควรปรับเป็นเพียง performance และ maintenance เพราะโหลด `app.css` ขนาดใหญ่ทั้งชุดแม้ใช้สไตล์น้อย และมี CSS auth/empty-state ซ้ำหลายชั้น

## ปัญหาเชิงสถาปัตยกรรมร่วม

### PWA cache และ versioning ไม่เป็นกลยุทธ์เดียวกัน

`sw.js` ไม่ได้ใส่ resource ที่หน้า active อ้างอิงหลายรายการ เช่น `readability-overhaul.css`, `mqtt.min.js`, `telegram-settings.js`, `cucumber-sales.js`, `noto-thai.js`, `settings-usage-layout.css`, `ota-standalone.html` และ asset บางตัว อีกทั้งหน้าใช้ query version เช่น `app.css?v=40` แต่ Service Worker ใช้ `caches.match(request)` โดยไม่ normalize query string [6]

ผลคือการติดตั้งแบบ offline หรือการอัปเดตจาก cache อาจได้หน้าแต่ไม่ได้ dependency, ใช้ version เก่า หรือ fallback ไม่ได้ ควรเลือกแนวทางเดียวระหว่าง precache ทุก production resource กับ runtime cache ที่ normalize URL แล้วเพิ่ม test ที่สร้าง service worker จริงและตรวจว่า cold install เปิดทุก route สำคัญได้

### CSS มีประวัติ override ซ้อนกันมากเกินไป

`app.css` มีประมาณ 1,900 บรรทัดและกำหนด selector ซ้ำหลายชั้น เช่น `body` หลายชุด, `.card`, `.bottom-nav`, `.app-shell` และ theme รุ่นเก่า/ใหม่ที่ประกาศต่อกัน การตรวจพบ `body` ซ้ำ 8 จุด, `.bottom-nav` ซ้ำ 8 จุด และ `.card` ซ้ำ 6 จุดใน file เดียวกัน [1]

ควรทำ CSS token layer เดียว แยก `app-shell`, `auth`, `docs`, `demo` ออกจากกัน และลบ legacy override หลังทำ visual regression การแยก docs stylesheet ยังช่วยแก้ปัญหา code contrast, H1 และ dependency ของหน้าเอกสารได้ตรงจุดกว่าการแก้ global selector เพิ่มอีกชั้น

### Error state ต้องเป็นข้อมูล ไม่ใช่เพียง console หรือ toast

หลายหน้ามี loading state แต่ไม่มี error state ที่อยู่ในตำแหน่งเดียวกัน เช่น account, admin, settings analytics และ Firebase setup gate ผู้ใช้จึงแยก “ไม่มีข้อมูล” ออกจาก “โหลดไม่สำเร็จ” ไม่ได้ ระบบควรใช้ state model อย่างน้อย `idle`, `loading`, `ready`, `empty`, `stale`, `error` และกำหนดข้อความ/ปุ่ม retry ให้แต่ละ state

### เอกสารควรสร้างจาก contract เดียวกับ source

ความคลาดเคลื่อน mode topics, ชื่อ firmware, D1 reset และขอบเขต Dashboard เป็นสัญญาณว่าการแก้ source กับเอกสารเกิดคนละจังหวะ ควรเก็บ topic, pin map, version, safety policy และหน้า entry point ไว้ใน machine-readable manifest แล้วสร้าง README/Markdown/HTML summary จากแหล่งเดียว พร้อมให้ CI ตรวจ diff ระหว่าง generated output กับ source

## Roadmap ที่แนะนำ

### ระยะที่ 1: ปิดความเสี่ยงก่อนใช้งานจริง

1. เปลี่ยน `setInsecure()` เป็น certificate/CA verification และเพิ่ม test ที่ยืนยัน broker identity
2. ย้าย OTA ไปอยู่หลัง VPN/gateway ที่เข้ารหัส หรือเพิ่ม HTTPS ที่เหมาะสม และเพิ่มคำเตือน plaintext ที่เด่นชัดจนกว่าจะเปลี่ยนสถาปัตยกรรม
3. ปรับ HiveMQ ACL ให้ least privilege แยก operator/device/read-only และบังคับ `wss://` ใน realtime viewer
4. ทำให้ Settings/OTA รอ `access:ready` ก่อน bind และเพิ่ม authorization ซ้ำที่ trusted boundary
5. เพิ่ม Firebase Rules validation สำหรับ `cucumberSales` และทดสอบ malformed payload ด้วย emulator
6. แก้ Cucumber UI ให้เริ่มหลัง auth พร้อม และแก้ reminder ให้แสดงผล local/cloud/device ตามผล publish จริง
7. ตรวจและ rotate MQTT/OTA credentials ที่เคยถูก commit ในประวัติ Git หากมีการใช้งานจริง

### ระยะที่ 2: แก้ความถูกต้องและความทนทานของระบบ

1. ทำ single source of truth สำหรับ MQTT contract และ hardware map แล้วแก้ mode, firmware filename และ D1 reset ให้ตรงกันทุกเอกสาร
2. แก้ PWA app shell, query-version strategy และ offline cold-install test
3. เพิ่ม timeout/cancel/submit lock/post-update verification ให้ OTA ทั้งสองหน้า
4. เพิ่ม pagination ของ admin users และ error/empty state ที่สอดคล้องกับตาราง
5. ตรวจวันที่แบบ round-trip และแก้ validation ของ Telegram Chat ID, backup import และ firmware file
6. เพิ่ม auth lifecycle integration test ที่จำลอง expired refresh token และ network delay
7. แก้ Settings anchor และ dead OTA test button

### ระยะที่ 3: ปรับ UX, accessibility และ performance

1. แยก CSS app/docs/auth/demo และลด cascade override ซ้ำ
2. แก้ code contrast, H1 ซ้ำ, landmark, skip link, table caption/scope และ icon `aria-hidden`
3. ทำ tab semantics ให้ครบใน Auth และ Schedule หรือเปลี่ยนเป็น button group ที่เหมาะสม
4. เพิ่ม alternative data สำหรับ canvas chart และ live region สำหรับสถานะสำคัญ
5. เพิ่ม focus-visible, keyboard-only test และ viewport 320/375/414/768/1280px ทุกหน้า
6. แยก page-specific bundle และ self-host/pin ฟอนต์กับ jsPDF ตามนโยบาย privacy/performance
7. ทำ design mockups ให้เป็น preview-only อย่างชัดเจนและแก้ dead control/state mismatch

## Definition of Done ที่ควรเพิ่มใน CI

| พื้นที่ | เกณฑ์ยอมรับ |
| --- | --- |
| Security | production firmware ไม่มี `setInsecure()`; OTA ไม่ส่ง password ผ่าน HTTP โดยไม่มี explicit secure network policy; broker ACL ทดสอบ read/write แยกกัน |
| Authorization | ผู้ใช้ทั่วไปเปิดหน้า Settings/OTA แล้วไม่เห็นหรือไม่สามารถ initialize action; callable ทุกตัว reject unauthenticated/non-admin จาก integration test |
| Data integrity | Firebase emulator reject `cucumberSales` ที่ผิด schema, field เกิน, ค่าติดลบ และ UID อื่น; backup import มี schema/rollback test |
| Auth lifecycle | ทุกโมดูลที่อ่าน/เขียนข้อมูลเริ่มหลัง `access:ready`; expired token และ network timeout แสดง retry state ไม่ค้าง loading |
| MQTT | viewer reject `ws://`, subscribe failure คืนปุ่ม Connect, simulator ผ่าน drop/reset/reconnect state tests |
| PWA | cold install cache เปิดทุก production route และ dependency ที่มี query version; offline route ไม่ขาว/ไม่ขาด script |
| Accessibility | ไม่มี H1 ซ้ำใน docs, ทุก table มี caption/scope, tabs มี ARIA ที่ถูกต้อง, canvas มี alternative data, contrast ผ่านเกณฑ์ที่เลือกใช้ |
| Visual/responsive | screenshot หรือ browser assertion ที่ 320, 375, 414, 768 และ 1280px ครบทุก primary page; ตรวจ focus ด้วย keyboard |
| Operations | OTA แสดงผลหลัง reboot หรือระบุ manual verification อย่างชัดเจน; audit log ไม่ทำให้ mutation สำเร็จถูกแสดงเป็น failure โดยไม่มี reconciliation |

## ข้อสรุป

ระบบไม่ควรหยุดพัฒนาเพราะ regression test ปัจจุบันผ่าน แต่ควรหยุดการนำไปใช้ควบคุมอุปกรณ์จากเครือข่ายที่ไม่น่าเชื่อถือจนกว่าจะปิดประเด็น TLS certificate validation, OTA plaintext authentication, MQTT ACL/storage และ Firebase validation ของ cucumber sales ก่อน หลังจากนั้นจึงแก้ auth lifecycle, PWA cache และ contract drift เพื่อให้ระบบเชื่อถือได้ในกรณี network failure และลดความเสี่ยงที่ผู้ปฏิบัติงานจะใช้เอกสารหรือสถานะบนหน้าจอผิดความหมาย

จุดแข็งของโครงการคือมีการแยก Firebase data ตาม UID, มี server-side admin checks, มี safety documentation และมี regression suite ที่ครอบคลุม logic หลายส่วน การปรับปรุงที่คุ้มค่าที่สุดจึงไม่ใช่การเพิ่ม feature ใหม่ แต่คือการทำให้ **security boundary, source of truth, runtime state และ UI state ตรงกัน** จากนั้นจึงค่อย refactor CSS และเพิ่ม visual/accessibility coverage

## References

[1]: https://github.com/klanarong156-pixel/New140869 "New140869 Smart Farm repository"
[2]: https://github.com/klanarong156-pixel/New140869/blob/cb9f7b59d3651bad6e003b3c3e1b4f30134436cf/README.txt "Smart Farm README and operating contract"
[3]: https://github.com/klanarong156-pixel/New140869/blob/cb9f7b59d3651bad6e003b3c3e1b4f30134436cf/MQTT_CONTRACT_V6.md "Smart Farm MQTT Contract V1.1"
[4]: https://github.com/klanarong156-pixel/New140869/blob/cb9f7b59d3651bad6e003b3c3e1b4f30134436cf/SmartFarm_V6_PRODUCTION1.ino "SmartFarm ESP8266 production firmware"
[5]: https://github.com/klanarong156-pixel/New140869/blob/cb9f7b59d3651bad6e003b3c3e1b4f30134436cf/firebase.rules.json "Smart Farm Firebase Realtime Database Rules"
[6]: https://github.com/klanarong156-pixel/New140869/blob/cb9f7b59d3651bad6e003b3c3e1b4f30134436cf/sw.js "Smart Farm Service Worker app shell and cache policy"
[7]: https://github.com/klanarong156-pixel/New140869/blob/cb9f7b59d3651bad6e003b3c3e1b4f30134436cf/.github/workflows/validate.yml "Smart Farm integration validation workflow"
[8]: https://github.com/klanarong156-pixel/New140869/actions/runs/35110589241 "Latest successful Smart Farm integration workflow run inspected"
[9]: https://klanarong156-pixel.github.io/New140869/ "Deployed Smart Farm GitHub Pages site"
[10]: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html "WCAG 2.2 Understanding Success Criterion 1.4.3 Contrast Minimum"
