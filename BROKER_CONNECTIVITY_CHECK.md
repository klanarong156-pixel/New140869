# Cloud MQTT Broker connectivity check

ตรวจสอบเมื่อ 15 สิงหาคม 2026

- Host: `650188a0ee2b4367b7c131fb385590a9.s1.eu.hivemq.cloud`
- DNS resolved to `46.137.47.218`, `52.31.149.80`, and `54.73.92.158`.
- TCP port `8883` is reachable from the sandbox.
- TCP port `8884` is reachable from the sandbox.
- TLS certificate on port `8883` has subject `CN=*.s1.eu.hivemq.cloud` and issuer `Let's Encrypt, YR1`.
- Certificate validity observed: 2026-08-15 through 2026-11-13.

ข้อจำกัด: การตรวจสอบนี้ยืนยัน DNS/TCP/TLS endpoint เท่านั้น ยังไม่ได้ยืนยัน MQTT authentication หรือ publish/subscribe จริง เพราะต้องใช้ username/password ของ broker ซึ่งไม่ควรบันทึกลงรีโพซิทอรี

แหล่งอ้างอิง endpoint จากไฟล์ `config.js` และ `SmartFarm_V6_PRODUCTION.ino` ในรีโพซิทอรีเดียวกัน

การเชื่อมต่อที่โค้ดกำหนด:
- ESP8266: TLS MQTT `8883`
- Dashboard: Secure WebSocket `wss://...:8884/mqtt`
- Shared topics: `smartfarm/relay/{relay}/set`, `smartfarm/relay/{relay}/status`, `smartfarm/mode/set`, `smartfarm/mode/status`, `smartfarm/schedule/{relay}/set`, `smartfarm/schedule/{relay}/status`, `smartfarm/status/online`, `smartfarm/device/status`, `smartfarm/sensor/dht11`
