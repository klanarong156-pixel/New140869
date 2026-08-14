# NewFarm V6.2 MQTT Contract

This is the active MQTT contract for the V6.0.1 Production Hardened firmware and V6.2 web app.

## Relay
- Command: `smartfarm/relay/{relay}/set`
- Payload: `ON` or `OFF`
- Status: `smartfarm/relay/{relay}/status`
- Status payload: `ON` or `OFF`

Relay IDs: `pump`, `zone1`, `lighthome`, `lightsala`.

## Mode
- Command: `smartfarm/mode/set`
- Status: `smartfarm/mode/status`
- Payload: `MANUAL` or `AUTO`
- A manual relay command received by firmware exits AUTO first, so firmware remains authoritative.

## Four independent schedules per relay
- Command: `smartfarm/schedule/{relay}/set`
- Payload: `{ "slots": [ {"enabled":true,"on":"HH:MM","off":"HH:MM"}, ... ] }`
- Maximum: 4 slots per relay.
- Each relay owns its own four slots; changing one relay never changes another.
- `DELETE` clears all four slots for that relay.
- Status: `smartfarm/schedule/{relay}/status`
- Status payload: `{ "slots": [ ...up to 4 slots... ] }`
- Schedules are stored in ESP8266 LittleFS and continue locally in AUTO when MQTT is temporarily unavailable.

## ESP status
- Online/LWT: `smartfarm/status/online`
- Payload: retained `true` while connected; broker LWT publishes retained `false` after an unexpected disconnect.
- Runtime heartbeat: `smartfarm/device/status` every 10 seconds while MQTT is connected.
- Heartbeat includes firmware version, free heap, RSSI, mode, pump safety lock, RTC validity and time when available.
- Dashboard considers the device offline after 25 seconds without a heartbeat/presence event.
- Browser MQTT disconnect does not by itself declare the ESP offline; ESP presence is determined from device messages.

## Sensor
Current active sensor is DHT11.
- Topic: `smartfarm/sensor/dht11`
- Payload JSON: `{ "temperature": number, "humidity": number }`
- No Soil Sensor topic exists; A0 is reserved.

## Time
- DS3231 is supported and used as the preferred local schedule clock when present and valid.
- I2C: SDA D2/GPIO4, SCL D1/GPIO5.
- If DS3231 is unavailable or invalid, the firmware falls back to NTP.
- NTP is used to synchronize DS3231 when Wi-Fi is available; periodic sync interval is 6 hours.

## Pump safety
- Maximum continuous pump runtime: 30 minutes.
- In AUTO, reaching the limit latches the pump OFF until the active schedule window ends.
- In MANUAL, reaching the limit latches the pump OFF until a new explicit ON command.
- In MANUAL, if MQTT remains disconnected for 60 seconds while the pump is running, the pump is forced OFF.
- ESP8266 boots with all four relays OFF.

## Browser MQTT credentials
- Username/password are not committed to source control.
- V6.2 remembers credentials in the browser's local storage when the user selects the remember option; otherwise they remain session-only.
- Invalid broker credentials clear the saved browser credentials and reopen the setup dialog.
- Commands issued during a short MQTT reconnect window are queued for up to 30 seconds and then discarded.
- A static GitHub Pages client cannot keep a shared MQTT credential secret from the browser; HiveMQ ACLs should be configured for broker-level authorization.

## Security
- Firebase Authentication provides user/admin roles for the web UI and Firebase rules protect role data.
- User: Dashboard, Relay and schedules. Admin: all user capabilities plus MQTT settings, role management and OTA page.
- Firmware currently uses TLS transport with certificate verification disabled (`setInsecure()`); certificate validation remains a firmware hardening option.
