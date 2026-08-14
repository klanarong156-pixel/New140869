# NewFarm V6.0 Hardware Standard

## Current firmware pin map
| Function | NodeMCU | GPIO | Status |
|---|---|---:|---|
| DHT11 DATA | D0 | GPIO16 | ACTIVE |
| Pump relay | D5 | GPIO14 | ACTIVE + 30 min safety |
| Zone 1 relay | D6 | GPIO12 | ACTIVE |
| Home light relay | D7 | GPIO13 | ACTIVE |
| Sala light relay | D8 | GPIO15 | ACTIVE |
| Soil sensor | A0 | ADC0 | RESERVED — no sensor installed |
| DS3231 SDA | D2 | GPIO4 | OPTIONAL / supported by firmware |
| DS3231 SCL | D1 | GPIO5 | OPTIONAL / supported by firmware |

## Important
- Firmware and dashboard use the pin map above.
- D8/GPIO15 is a boot-strap pin; relay hardware must not force an invalid boot level.
- All relays are initialized OFF during boot.
- The pump has a hard 30-minute continuous runtime safety limit.
- In MANUAL, a 60-second MQTT loss forces a running pump OFF.
- DS3231 is supported; when unavailable the firmware falls back to NTP.
- Soil A0 is reserved and is not published as a sensor value.
