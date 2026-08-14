สวนลุงนะ Smart Farm V7.0

Architecture
- Dashboard: static Progressive Web App for GitHub Pages.
- ESP8266: local sensor, relay, MQTT, OTA and schedule controller.
- MQTT: real-time transport between Dashboard and ESP8266.
- Firebase Authentication + Realtime Database: private profile, finance data and user/admin roles.
- ESP8266 LittleFS: local schedules, MQTT credentials and OTA password.

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
- Switching from AUTO to MANUAL turns all relays OFF first; the operator can then issue individual MANUAL commands.
- Pump maximum continuous runtime is 30 minutes.
- In MANUAL, a running pump is forced OFF after 60 seconds without MQTT.
- All relays initialize OFF at boot.
- Dashboard Rain Protection blocks selecting AUTO when Open-Meteo reports rain risk. This is a dashboard-level safeguard; the ESP8266 cannot evaluate web weather data while offline, so field hardware safety limits remain essential.

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
- MQTT browser credentials are intentionally blank in config.js and must be entered by the operator. They are saved only in session storage, or optional local storage when “remember this device” is selected.
- ESP MQTT/OTA credentials are stored locally in LittleFS and are not committed.
- Firebase rules protect user-scoped profile/finance data and root roles.
- HiveMQ ACLs should be configured for broker-level authorization.
- Firmware currently uses TLS transport with certificate verification disabled through setInsecure(); pinning or a trust-anchor configuration is a recommended production hardening follow-up.

Build and validation
- Arduino IDE target: NodeMCU 1.0 (ESP-12E Module), esp8266:esp8266:nodemcuv2.
- Compile the firmware after every change and upload the resulting binary only after a successful build.
- A successful build proves compilation only; physical Wi-Fi, MQTT, DHT11, DS3231 and relay/pump behavior must be tested on the real NodeMCU.
- Use Serial Monitor at 115200 baud. The firmware prints reset diagnostics at boot.
