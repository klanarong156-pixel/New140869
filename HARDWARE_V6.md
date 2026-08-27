# Hardware reference · Smart Farm V7.1 Field Stability

ตารางนี้ต้องอ่านร่วมกับ `SmartFarm_V6_PRODUCTION.ino` ซึ่งเป็นแหล่งอ้างอิงของ pin map ที่ใช้งานจริง

| Function | NodeMCU | GPIO | Status |
| --- | --- | ---: | --- |
| DHT11 DATA | D2 | GPIO4 | Active |
| DS3231 SDA | D3 | GPIO0 | Active when RTC is installed |
| DS3231 SCL | D4 | GPIO2 | Active when RTC is installed |
| Pump relay | D5 | GPIO14 | Active; follows schedule/manual/timer command |
| Zone 1 relay | D6 | GPIO12 | Active |
| Home light relay | D7 | GPIO13 | Active |
| Sala light relay | D8 | GPIO15 | Active |
| Soil sensor | A0 | ADC0 | Reserved; no sensor is installed |

## Operating notes

All relays are set to OFF at boot. The pump follows the schedule or explicit relay/timer command selected by the operator; there is no forced 30-minute runtime cutoff and no automatic MQTT-loss cutoff. Schedules stored in LittleFS remain active even if MQTT is unavailable. A finite timer turns a relay OFF only when that explicitly requested countdown expires; `UNLIMITED` intentionally has no timer expiry. HTTP/ArduinoOTA forces relays OFF only during firmware update. A dashboard Emergency Stop latch is separate from a physical E-stop/contactor and must not be the only safety layer for a real pump.

> D3/GPIO0, D4/GPIO2 and D8/GPIO15 are ESP8266 boot-strap pins. The connected RTC and relay circuits must not force an invalid boot level while the board starts.
