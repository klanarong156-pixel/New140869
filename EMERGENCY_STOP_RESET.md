# Smart Farm Emergency Stop / Reset

## Firmware contract

The ESP8266 firmware already implements the emergency lock:

- State: `emergencyLock`
- Stop function: `engageEmergencyStop(source)`
- Reset function: `resetEmergencyStop(source)`
- MQTT command topic: `smartfarm/emergency/set`
- Stop payload: `STOP` or `EMERGENCY_STOP`
- Reset payload: `RESET` or `EMERGENCY_RESET`
- Status topic: `smartfarm/emergency/status`

When STOP is received, all four relays are forced OFF and the emergency lock becomes active.

When RESET is received, the lock is cleared and the firmware reapplies the current AUTO schedule when a valid clock is available.

## Dashboard

The dashboard now exposes a dedicated Emergency Stop panel with:

1. `STOP · หยุดฉุกเฉิน` — sends `STOP` through MQTT.
2. `RESET · ปลดล็อก` — enabled only after the dashboard receives an active emergency state.
3. The panel listens to `smartfarm/emergency/status` through the existing MQTT handler and reflects the confirmed ESP8266 state.

The dashboard does not assume that a command succeeded. It waits for the device status message before changing the confirmed emergency state.

## Safety behavior

- STOP requires user confirmation.
- RESET requires user confirmation.
- RESET is disabled while the ESP8266 has not reported an active emergency.
- If MQTT is disconnected, the dashboard does not send the emergency command.
- After RESET, AUTO scheduling may turn a relay back on if its schedule is currently active.
