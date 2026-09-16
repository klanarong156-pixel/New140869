# Smart Farm V7.1 / MQTT Contract V1.1 compatibility

เฟิร์มแวร์ `V7.1.0-FIELD-STABILITY` และเว็บแอป V7.1 ใช้ topic ต่อไปนี้

| Feature | Command topic | Status topic | Payload |
| --- | --- | --- | --- |
| Relay | `smartfarm/relay/{relay}/set` | `smartfarm/relay/{relay}/status` | `ON` or `OFF` |
| Emergency latch | `smartfarm/emergency/set` | `smartfarm/emergency/status` | `STOP`/`EMERGENCY_STOP` or `RESET`/`EMERGENCY_RESET` |
| Mode | `smartfarm/mode/set` | `smartfarm/mode/status` | `AUTO` or `MANUAL` |
| Schedule | `smartfarm/schedule/{relay}/set` | `smartfarm/schedule/{relay}/status` | JSON slots or `DELETE` |
| Presence | — | `smartfarm/status/online` | retained `true` / LWT `false` |
| Heartbeat | — | `smartfarm/status/device` | device JSON every 10 seconds |
| Sensor | — | `smartfarm/sensor/dht11` | temperature/humidity JSON |
| Time | — | `smartfarm/time` | local Asia/Bangkok time JSON |
| System error | — | `smartfarm/system/error` | JSON diagnostic error |
| Telegram configuration | `smartfarm/config/telegram/set` | `smartfarm/config/telegram/status` | JSON `{ "botToken": "...", "chatId": "..." }`; status JSON reports `configured` |
| Telegram test | `smartfarm/config/telegram/test` | — | any payload triggers a test message |
| Crop reminder | `smartfarm/reminder/set` | `smartfarm/reminder/status` | JSON operation `settings`, `upsert`, `done`, `snooze`, `delete`, `sync` or `test` |
| Farm AI alert | `smartfarm/ai/alert/set` | `smartfarm/ai/alert/status` | JSON `{ "id": "...", "severity": "info|warning|critical", "title": "...", "message": "..." }`; analysis only, never a relay command |

Relay identifiers are `pump`, `zone1`, `lighthome` and `lightsala`. Command topics are non-retained so stale commands are not replayed after reconnect. Relay, schedule, mode and emergency status messages are retained by the device so a newly connected dashboard can render the current state.

## Mode behavior

`AUTO` and `MANUAL` are active firmware modes. `AUTO` allows the four locally stored schedule slots per relay to control outputs when the clock is valid. `MANUAL` prevents `applyAutoState()` from changing relay outputs; direct ON/OFF commands remain available subject to emergency/OTA safety locks. The firmware accepts `smartfarm/mode/set` with `AUTO` or `MANUAL` and publishes the retained state on `smartfarm/mode/status`.

## Schedule payload

```json
{
  "slots": [
    {"enabled": true, "on": "06:00", "off": "06:20"},
    {"enabled": false, "on": "00:00", "off": "00:00"}
  ]
}
```

Each relay has at most four independent slots. The firmware rejects equal start and stop times, rejects overlapping enabled slots, persists accepted slots in LittleFS, and applies them when the local clock is valid and mode is `AUTO`. A `DELETE` payload clears all four slots for the selected relay.

## Crop Telegram reminders

The dashboard sends reminder commands through the non-retained topic `smartfarm/reminder/set`. The ESP8266 stores up to eight reminders in `/smartfarm_reminders.json`, checks the existing RTC/NTP time every 30 seconds, and sends the reminder after the configured time when the due date minus `leadDays` equals the current date. The default is one day before at 18:00.

## Farm AI alerts

The client-side Smart Farm Rule Engine analyzes sensor, weather, RTC, device heartbeat and relay state only while the dashboard is open. It sends a bounded, non-retained JSON alert through `smartfarm/ai/alert/set`; the firmware validates the severity, identifier and message length, suppresses duplicate IDs for 15 minutes, rate-limits alerts to one per minute, queues the Telegram message, and publishes a non-retained result on `smartfarm/ai/alert/status`. This topic is isolated from every relay and timer topic. The rule engine is advisory and cannot issue `ON`, `OFF`, timer, schedule or emergency commands.

## Control and safety behavior

The pump has **no forced 30-minute continuous-runtime cutoff** and no automatic MQTT-loss cutoff; it follows the selected ON/OFF command or local schedule. `EMERGENCY_STOP` turns all relays OFF and blocks schedule/manual ON until `EMERGENCY_RESET`.

Before HTTP or ArduinoOTA firmware writing starts, the firmware forces all relays OFF and pauses schedule application. A failed or aborted update does not reboot the device and releases the temporary OTA safe state. This software state is not a replacement for a physical E-stop, contactor, float switch, pressure switch or thermal overload on a real pump circuit.

The firmware publishes an online heartbeat including version, free heap, heap fragmentation/max block, RSSI, uptime, reset reason, pump safety lock/runtime, emergency lock/source, RTC validity, DHT11 age/fault counters and Wi-Fi/MQTT reconnect counters. The dashboard treats the device as offline after 25 seconds without a heartbeat or presence update. Browser MQTT connectivity alone does not determine ESP8266 online status.

## Credentials and boundaries

The dashboard source contains no MQTT username or password. An operator enters credentials in the browser; they are stored in session storage by default, or in local storage only after selecting “remember this device.” Commands issued in a short reconnect window are queued for up to 30 seconds. Telegram bot token and chat ID are sent from the dashboard to the ESP8266 over the authenticated MQTT command topic and are persisted in LittleFS; they are never placed in `config.js`.

A static web client cannot protect a shared broker credential from a person who can use that credential in a browser. Configure HiveMQ ACLs and rotate any password that was committed in a prior repository revision.

The active hardware time map is DHT11 on D2/GPIO4 and DS3231 I²C on D3/GPIO0 plus D4/GPIO2. Firmware MQTT uses HiveMQ Cloud TLS on port 8883; the current `setInsecure()` configuration encrypts the transport but skips server-certificate validation. The web dashboard uses HiveMQ WSS on port 8884. At boot, the firmware reports NTP epoch validity. When PubSubClient returns `MQTT_CONNECT_FAILED` (`state=-2`), it additionally reports DNS resolution and a separate TLS/TCP probe so an operator can distinguish network/TLS failure from MQTT authentication failure.

## Compatibility notes

- `Wy` is a backup dashboard only and is **not** the source of truth for this contract.
- `New140869` is the production source of truth for firmware, MQTT and the primary dashboard.
- Soil sensor `A0` remains a firmware/hardware legacy definition unless explicitly used by the production dashboard; it must not be used to invent an automatic watering feature that is absent from the active contract.
- The dashboard and firmware must be mapped against the exact topics above before any UI refactor is considered complete.
