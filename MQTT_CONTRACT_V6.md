# Smart Farm V7.1 MQTT contract

เฟิร์มแวร์ `V7.1.0-FIELD-STABILITY` และเว็บแอป V7.1 ใช้ topic ต่อไปนี้

| Feature | Command topic | Status topic | Payload |
| --- | --- | --- | --- |
| Relay | `smartfarm/relay/{relay}/set` | `smartfarm/relay/{relay}/status` | `ON` or `OFF` |
| Emergency latch | `smartfarm/emergency/set` | `smartfarm/emergency/status` | `EMERGENCY_STOP` or `EMERGENCY_RESET` |
| Schedule | `smartfarm/schedule/{relay}/set` | `smartfarm/schedule/{relay}/status` | JSON slots or `DELETE` |
| Presence | — | `smartfarm/status/online` | retained `true` / LWT `false` |
| Heartbeat | — | `smartfarm/device/status` | device JSON every 10 seconds |
| Sensor | — | `smartfarm/sensor/dht11` | temperature/humidity JSON |
| Telegram configuration | `smartfarm/config/telegram/set` | `smartfarm/config/telegram/status` | JSON `{ "botToken": "...", "chatId": "..." }`; status JSON reports `configured` |
| Telegram test | `smartfarm/config/telegram/test` | — | any payload triggers a test message |
| Crop reminder | `smartfarm/reminder/set` | `smartfarm/reminder/status` | JSON operation `settings`, `upsert`, `done`, `snooze`, `delete`, `sync` or `test`; optional recurrence, plot and quiet-hour fields |

Relay identifiers are `pump`, `zone1`, `lighthome` and `lightsala`. Command topics are non-retained so stale commands are not replayed after reconnect. Relay, timer, schedule and emergency status messages are retained by the device so a newly connected dashboard can render the current state.

## Relay countdown timer

Dashboard starts or cancels an automatic OFF timer with the non-retained topic `smartfarm/relay/{relay}/timer/set`. The payload is an integer number of seconds from `1` to `4294967` (about 71,582 minutes), `UNLIMITED`, `0` or `CANCEL`. A finite timer turns the selected relay OFF when the explicitly requested countdown expires. The retained status topic is `smartfarm/relay/{relay}/timer/status` with JSON payload `{ "active": true, "unlimited": false, "remaining": 120 }`. Values beyond the technical `millis()` range are rejected; this is not a 30-minute pump policy.

`CANCEL` clears an active countdown timer. `UNLIMITED` intentionally has no timer expiry.

## Schedule payload

```json
{
  "slots": [
    {"enabled": true, "on": "06:00", "off": "06:20"},
    {"enabled": false, "on": "00:00", "off": "00:00"}
  ]
}
```

Each relay has at most four independent slots. The firmware rejects equal start and stop times, persists accepted slots in LittleFS, and applies them when the local clock is valid. A `DELETE` payload clears all four slots for the selected relay.

## Crop Telegram reminders

The dashboard sends reminder commands through the non-retained topic `smartfarm/reminder/set`. The ESP8266 stores up to eight reminders in `/smartfarm_reminders.json`, checks the existing RTC/NTP time every 30 seconds, and sends the reminder after the configured time when the due date minus `leadDays` equals the current date. The default is one day before at 18:00.

Example settings payload:

```json
{"op":"settings","enabled":true,"repeatDaily":false,"quietStart":"22:00","quietEnd":"07:00","leadDays":1,"hour":18,"minute":0}
```

Example task payload:

```json
{"op":"upsert","id":"task-fertilize-2","title":"ใส่ปุ๋ยครั้งที่ 2","due":"2026-08-08","leadDays":1,"repeatEveryDays":0,"plotId":"plot-legacy","note":"ปุ๋ยละลายช้า 1 ช้อนโต๊ะต่อต้น","enabled":true,"done":false}
```

`done` marks a task complete, `snooze` changes its due date, `delete` removes it, `sync` asks for retained reminder status, and `test` sends a test Telegram message. Each task stores `lastSentDate` so the same reminder is not sent twice on the same day. `repeatEveryDays` from 1–30 advances the due date after a successful send, while `plotId` identifies the crop area. `quietStart` and `quietEnd` define a local-time window during which the device does not send reminders. If daily overdue reminders are enabled, an incomplete overdue task is sent once per day after the configured time. The device must have Wi‑Fi, a valid RTC/NTP clock, and Telegram credentials configured; if it was offline at the scheduled time, it can send later on the same day after reconnecting.

## Control and safety behavior

The Firmware has no active mode topic. Schedules run locally from the four saved slots when the clock is valid, while direct relay commands and timers use the existing relay topics. The pump has **no forced 30-minute continuous-runtime cutoff** and no automatic MQTT-loss cutoff; it follows the schedule or explicit command selected by the operator. `EMERGENCY_STOP` turns all relays OFF, cancels timers and blocks schedule/manual/timer ON until `EMERGENCY_RESET`.

Before HTTP or ArduinoOTA firmware writing starts, the firmware forces all relays OFF and pauses schedule application. A failed or aborted update does not reboot the device and releases the temporary OTA safe state. This software state is not a replacement for a physical E-stop, contactor, float switch, pressure switch or thermal overload on a real pump circuit.

The firmware publishes an online heartbeat including version, free heap, heap fragmentation/max block, RSSI, uptime, reset reason, pump safety lock/runtime, emergency lock/source, RTC validity, DHT11 age/fault counters and Wi-Fi/MQTT reconnect counters. The dashboard treats the device as offline after 25 seconds without a heartbeat or presence update. Browser MQTT connectivity alone does not determine ESP8266 online status.

## Credentials and boundaries

The dashboard source contains no MQTT username or password. An operator enters credentials in the browser; they are stored in session storage by default, or in local storage only after selecting “remember this device.” Commands issued in a short reconnect window are queued for up to 30 seconds. Telegram bot token and chat ID are sent from the dashboard to the ESP8266 over the authenticated MQTT command topic and are persisted in LittleFS; they are never placed in `config.js`.

> A static web client cannot protect a shared broker credential from a person who can use that credential in a browser. Configure HiveMQ ACLs and rotate any password that was committed in a prior repository revision.

The active hardware time map is DHT11 on D2/GPIO4 and DS3231 I²C on D3/GPIO0 plus D4/GPIO2. Firmware MQTT uses HiveMQ Cloud TLS on port 8883; the current `setInsecure()` configuration encrypts the transport but skips server-certificate validation. At boot, the firmware reports NTP epoch validity. When PubSubClient returns `MQTT_CONNECT_FAILED` (`state=-2`), it additionally reports DNS resolution and a separate TLS/TCP probe so an operator can distinguish network/TLS failure from MQTT authentication failure.
