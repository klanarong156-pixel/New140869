สวนลุงนะ Smart Farm V7.0

Architecture
- Dashboard: static Progressive Web App for GitHub Pages.
- ESP8266: local sensor, relay, MQTT, OTA and schedule controller.
- MQTT: real-time transport between Dashboard and ESP8266.
- SharedWorker: keeps one browser MQTT WebSocket shared across app pages while the app is open; broker URL, credentials and existing topics remain unchanged.
- Firebase Authentication + Realtime Database: private profile, finance data and user/admin roles.
- ESP8266 LittleFS: local schedules, crop Telegram reminders, MQTT credentials and OTA password.

Hardware pin map — source of truth: SmartFarm_V6_PRODUCTION.ino
- DHT11 data: D2 / GPIO4.
- DS3231 SDA: D3 / GPIO0.
- DS3231 SCL: D4 / GPIO2.
- Pump relay: D5 / GPIO14.
- Zone 1 relay: D6 / GPIO12.
- Home light relay: D7 / GPIO13.
- Sala light relay: D8 / GPIO15.
- A0 is reserved; no soil sensor is installed.

Automation and safety
- MANUAL and AUTO modes are available.
- Four independent schedule slots are stored locally for each relay.
- Schedules execute locally in AUTO even if MQTT is temporarily unavailable.
- Crop reminders are stored on ESP8266 and can send Telegram messages at a configured time even when the Dashboard is closed.
- The Dashboard has Simple and Advanced modes. Simple mode focuses on today’s controls and tasks; Advanced mode adds system health, 24-hour telemetry chart, relay runtime statistics and backup tools.
- Crop management supports up to eight crop tasks on the ESP8266, up to eight named plots in the browser/Firebase layer, lead-time settings, completion, one-day snooze, recurring tasks and optional daily overdue reminders.
- Telegram quiet hours are stored as scheduler settings on the ESP8266; reminders are deferred during the quiet window and retried after it when the task remains eligible.
- Switching from AUTO to MANUAL turns all relays OFF first; the operator can then issue individual MANUAL commands.
- ปั๊มทำงานตามตารางที่บันทึกใน ESP8266 หรือคำสั่งเปิด/ปิดและ timer ที่ผู้ใช้ส่งมา ระบบ **ไม่มี hard cutoff 30 นาที** และ MQTT หลุดจะไม่ตัดตารางรดน้ำที่ทำงานใน ESP8266 โดยอัตโนมัติ
- Timer แบบกำหนดเวลาและ `UNLIMITED` เป็นตัวเลือกที่ผู้ใช้สั่งเอง ไม่ใช่เพดาน runtime ของปั๊ม; การกด Emergency Stop ใน Dashboard จะส่งคำสั่ง OFF ให้รีเลย์ทั้ง 4 จุด
- ระหว่าง OTA ระบบจะบังคับรีเลย์ทั้งหมดเป็น OFF ก่อนเขียน Flash; หากอัปโหลดล้มเหลวจะไม่รีบูต และคืนการทำงานปกติ
- All relays initialize OFF at boot.
- Dashboard Rain Protection blocks selecting AUTO when Open-Meteo reports rain risk. This is a dashboard-level safeguard; the ESP8266 cannot evaluate web weather data while offline, so field hardware safety limits remain essential.
- Emergency Stop is an additive dashboard action that sends the existing OFF relay commands to all four relay identifiers. It does not change the relay topic or firmware contract, and it is **not** a physical emergency disconnect.
- สำหรับปั๊มจริงควรติดตั้ง physical E-stop/contactor, ลูกลอย, pressure switch หรือ thermal overload ตามวงจรไฟฟ้า โดยต้องทดสอบกับผู้รับผิดชอบหน้างาน.

Time
- DS3231 is the preferred local clock when present and valid.
- NTP synchronizes DS3231 when Wi-Fi is available and provides fallback time when RTC is unavailable.
- The homepage clock uses the `time` field from the ESP8266 device heartbeat only when `rtc`/RTC validity is true. It shows the RTC source and waits for an RTC heartbeat instead of silently using the browser clock.

MQTT topics
- smartfarm/relay/{relay}/set and /status
- smartfarm/mode/set and /status
- smartfarm/schedule/{relay}/set and /status
- smartfarm/status/online
- smartfarm/device/status
- smartfarm/sensor/dht11
- smartfarm/config/telegram/set and /test
- smartfarm/reminder/set and /status (settings, upsert, done, snooze, delete, sync and test; optional plot, recurrence and quiet-hour fields)

Security
- MQTT browser credentials are intentionally blank in config.js and must be entered by the operator. They are saved only in session storage, or optional local storage when “remember this device” is selected.
- ESP MQTT/OTA credentials are stored locally in LittleFS and are not committed.
- Telegram bot token and chat ID remain stored locally on the ESP8266; reminder task text and dates are stored separately from credentials.
- Browser backup/export intentionally excludes passwords, tokens, secrets and credential-like keys. Import restores non-secret local data and, when the user is authenticated, the crop/analytics records to the user-scoped Firebase paths.
- Firebase rules protect user-scoped profile/finance data and root roles.
- HiveMQ ACLs should be configured for broker-level authorization.
- Firmware MQTT และ Telegram ยังคงใช้ TLS transport ตามระบบเดิม; MQTT certificate verification ยังเป็นงาน hardening แยกต่างหากและไม่ได้เปลี่ยนในชุดนี้ เพื่อไม่กระทบ broker, credential flow หรือความเสถียรภาคสนาม.
- Heartbeat เพิ่มข้อมูลวิเคราะห์แบบ additive ได้แก่ reset reason, heap fragmentation, sensor age/fault count, pump runtime ที่กำลังเกิดขึ้น และจำนวน reconnect; ข้อมูลเหล่านี้ใช้เฝ้าระวังเท่านั้น ไม่สั่งตัดปั๊มอัตโนมัติ.

Build and validation
- Arduino IDE target: NodeMCU 1.0 (ESP-12E Module), esp8266:esp8266:nodemcuv2.
- Compile the firmware after every change and upload the resulting binary only after a successful build.
- A successful build proves compilation only; physical Wi-Fi, MQTT, DHT11, DS3231 and relay/pump behavior must be tested on the real NodeMCU.
- Use Serial Monitor at 115200 baud. The firmware prints reset diagnostics at boot. ก่อนใช้โหลดจริง ให้ทดสอบด้วย LED/รีเลย์เปล่าและตรวจ physical E-stop แยกจากคำสั่ง MQTT.
