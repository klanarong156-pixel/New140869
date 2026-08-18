# Smart Farm V7.0 MQTT contract

เฟิร์มแวร์ `V7.0.0-PRODUCTION-HARDENED` และเว็บแอป V7 ใช้ topic ต่อไปนี้

| Feature | Command topic | Status topic | Payload |
| --- | --- | --- | --- |
| Relay | `smartfarm/relay/{relay}/set` | `smartfarm/relay/{relay}/status` | `ON` or `OFF` |
| Mode | `smartfarm/mode/set` | `smartfarm/mode/status` | `MANUAL` or `AUTO` |
| Schedule | `smartfarm/schedule/{relay}/set` | `smartfarm/schedule/{relay}/status` | JSON slots or `DELETE` |
| Presence | — | `smartfarm/status/online` | retained `true` / LWT `false` |
| Heartbeat | — | `smartfarm/device/status` | device JSON every 10 seconds |
| Sensor | — | `smartfarm/sensor/dht11` | temperature/humidity JSON |
| Telegram configuration | `smartfarm/config/telegram/set` | `smartfarm/config/telegram/status` | JSON `{ "botToken": "...", "chatId": "..." }`; status JSON reports `configured` |
| Telegram test | `smartfarm/config/telegram/test` | — | any payload triggers a test message |

Relay identifiers are `pump`, `zone1`, `lighthome` and `lightsala`. Command topics are non-retained so stale commands are not replayed after reconnect. Relay and mode status messages are retained by the device so a newly connected dashboard can render the current state.

## Schedule payload

```json
{
  "slots": [
    {"enabled": true, "on": "06:00", "off": "06:20"},
    {"enabled": false, "on": "00:00", "off": "00:00"}
  ]
}
```

Each relay has at most four independent slots. The firmware rejects equal start and stop times, persists accepted slots in LittleFS, and applies them only in AUTO mode. A `DELETE` payload clears all four slots for the selected relay.

## Mode and safety behavior

A direct relay command received while AUTO is active first changes firmware mode to MANUAL. A command that explicitly changes mode from AUTO to MANUAL turns every relay OFF before publishing the fresh mode and relay statuses. In AUTO, a pump that reaches its 30-minute continuous runtime limit remains safety-latched OFF until the current schedule window ends. In MANUAL, a running pump is forced OFF after 60 seconds without MQTT.

The firmware publishes an online heartbeat including version, free heap, RSSI, mode, pump safety lock and RTC validity. The dashboard treats the device as offline after 25 seconds without a heartbeat or presence update. Browser MQTT connectivity alone does not determine ESP8266 online status.

## Credentials and boundaries

The dashboard source contains no MQTT username or password. An operator enters credentials in the browser; they are stored in session storage by default, or in local storage only after selecting “remember this device.” Commands issued in a short reconnect window are queued for up to 30 seconds. Telegram bot token and chat ID are sent from the dashboard to the ESP8266 over the authenticated MQTT command topic and are persisted in LittleFS; they are never placed in `config.js`.

> A static web client cannot protect a shared broker credential from a person who can use that credential in a browser. Configure HiveMQ ACLs and rotate any password that was committed in a prior repository revision.

The active hardware time map is DHT11 on D2/GPIO4 and DS3231 I²C on D3/GPIO0 plus D4/GPIO2. Firmware MQTT uses HiveMQ Cloud TLS on port 8883; the current `setInsecure()` configuration encrypts the transport but skips server-certificate validation. At boot, the firmware reports NTP epoch validity. When PubSubClient returns `MQTT_CONNECT_FAILED` (`state=-2`), it additionally reports DNS resolution and a separate TLS/TCP probe so an operator can distinguish network/TLS failure from MQTT authentication failure.
