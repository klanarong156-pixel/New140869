สวนลุงนะ Smart Farm V6.0.1 Production Hardened

Architecture
- Dashboard: static web app on GitHub Pages.
- ESP8266: sensor / relay / MQTT / OTA controller only.
- MQTT: real-time transport between Dashboard and ESP8266.
- Firebase Authentication + Realtime Database: persistent dashboard/account data and user/admin roles.
- ESP8266 LittleFS: local schedules, MQTT credentials and OTA password.

Hardware
- NodeMCU 1.0 (ESP-12E / ESP8266)
- DHT11: D0 / GPIO16
- DS3231: SDA D2 / GPIO4, SCL D1 / GPIO5
- Pump relay: D5 / GPIO14
- Zone 1 relay: D6 / GPIO12
- Home light relay: D7 / GPIO13
- Sala light relay: D8 / GPIO15
- A0 reserved; no soil sensor installed

Automation and safety
- MANUAL and AUTO modes.
- Four independent schedule slots per relay.
- Schedules execute locally from LittleFS in AUTO even if MQTT is temporarily unavailable.
- Pump maximum continuous runtime: 30 minutes.
- In MANUAL, a running pump is forced OFF after 60 seconds without MQTT.
- All relays initialize OFF at boot.

Time
- DS3231 is the preferred local clock when present and valid.
- NTP synchronizes DS3231 when Wi-Fi is available and provides fallback time when RTC is unavailable.

MQTT topics
- smartfarm/relay/{relay}/set and /status
- smartfarm/mode/set and /status
- smartfarm/schedule/{relay}/set and /status
- smartfarm/status/online
- smartfarm/device/status
- smartfarm/sensor/dht11

Security
- MQTT browser credentials are session-only and are not committed.
- ESP MQTT/OTA credentials are stored locally in LittleFS and are not committed.
- Firebase rules protect users/finance and root roles.
- HiveMQ ACLs should be configured for broker-level authorization.
- Firmware currently uses TLS with certificate verification disabled via setInsecure(); certificate validation is a remaining hardening option.

Build
- Arduino IDE target: NodeMCU 1.0 (ESP-12E Module).
- GitHub Actions target: esp8266:esp8266:nodemcuv2.
- CI artifact: SmartFarm_V6_PRODUCTION.bin.
- Latest verified build passed on 2026-08-11 for commit de23cff80d78d88f10a1d77606ca45e1f0aa3571.
- Build resource usage was 41% global RAM, 94% IRAM and 48% flash; IRAM headroom is limited.

Important
- A successful CI build proves compilation only; physical Wi-Fi, MQTT, DHT11, DS3231 and relay/pump behavior must still be tested on the real NodeMCU.
- Serial Monitor should be 115200 baud. V6.0.1 prints reset diagnostics at boot to diagnose reboot loops.
