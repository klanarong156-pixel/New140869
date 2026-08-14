# Hardware reference · Smart Farm V7.0

ตารางนี้ต้องอ่านร่วมกับ `SmartFarm_V6_PRODUCTION.ino` ซึ่งเป็นแหล่งอ้างอิงของ pin map ที่ใช้งานจริง

| Function | NodeMCU | GPIO | Status |
| --- | --- | ---: | --- |
| DHT11 DATA | D2 | GPIO4 | Active |
| DS3231 SDA | D3 | GPIO0 | Active when RTC is installed |
| DS3231 SCL | D4 | GPIO2 | Active when RTC is installed |
| Pump relay | D5 | GPIO14 | Active + 30-minute safety limit |
| Zone 1 relay | D6 | GPIO12 | Active |
| Home light relay | D7 | GPIO13 | Active |
| Sala light relay | D8 | GPIO15 | Active |
| Soil sensor | A0 | ADC0 | Reserved; no sensor is installed |

## Operating notes

All relays are set to OFF at boot. In MANUAL mode, the firmware forces a running pump OFF after 60 seconds without MQTT. In AUTO mode, the schedules stored in LittleFS remain active even if MQTT is unavailable. Moving from AUTO to MANUAL explicitly turns every relay OFF before allowing individual manual commands.

> D3/GPIO0, D4/GPIO2 and D8/GPIO15 are ESP8266 boot-strap pins. The connected RTC and relay circuits must not force an invalid boot level while the board starts.
