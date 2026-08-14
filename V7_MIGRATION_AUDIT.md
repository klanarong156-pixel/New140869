# Smart Farm V7 Migration Audit

Date: 2026-08-12
Repository: klanarong156-pixel/Newfarm
Branch: main

## Decision

Rebuild the Dashboard UI/application layer from the existing production base, while preserving the proven ESP8266 firmware contract, Firebase data model, authentication, finance records, MQTT topics, schedules, and safety behavior.

Do not delete or overwrite the V6 production implementation until the V7 replacement passes functional checks.

## KEEP — production foundations

### Firmware
- `SmartFarm_V6_PRODUCTION.ino` is the active firmware source.
- Preserve MANUAL/AUTO behavior.
- Preserve four relay IDs: `pump`, `zone1`, `lighthome`, `lightsala`.
- Preserve MQTT topic contract.
- Preserve local LittleFS schedules.
- Preserve pump 30-minute maximum runtime and MQTT-loss safety behavior.
- Preserve DHT11 and RTC/NTP time services.
- Preserve OTA capability in firmware, but remove OTA from normal farmer UI.

The firmware source is already documented as the single production source and CI build target. fileciteturn49file0

### MQTT
Preserve the existing contract in `MQTT_CONTRACT_V6.md`: relay control, mode, schedules, device presence/heartbeat, and DHT11 sensor messages. fileciteturn53file0

### Firebase
Preserve Firebase Authentication, per-user database storage, root role checks, and finance storage. The current Firebase wrapper separates user-scoped data from root role access. fileciteturn50file0

### Finance data
Keep the existing finance data structure and operations:
- income
- expense
- pending
- createdAt
- per-user Firebase storage
- summary/profit calculation
- delete
- PDF export capability

The current finance module writes to `users/{uid}/finance/{id}`. fileciteturn52file0turn58file0

### Weather
Keep Open-Meteo integration and the agreed Rain Protection rules:
- location 7.798754, 99.990505
- 7-day forecast
- rain probability threshold 60%
- 6-hour precipitation threshold 1 mm
- API failure blocks Auto Watering

The current implementation already contains these rules. fileciteturn51file0

### CI
Keep firmware build, dashboard smoke test, and static deployment workflows. Current repository contains separate firmware, dashboard-check, and static workflows. fileciteturn47file0

## REFACTOR — application layer

### Current Home
`index.html` currently combines the V6.2 shell, relay controls, MQTT state, hardware information, weather injection, and five-item navigation. This should become the new V7 Home module and should no longer expose hardware pin details to ordinary farmers. fileciteturn42file0

### Current Schedule
`schedule.html` is functionally valuable but is still a separate document with its own Firebase/access/MQTT/script stack. Rebuild it as the V7 Watering module while retaining the four-slot-per-relay MQTT contract. fileciteturn63file0

### Current Finance
`finance.html` contains the important finance behavior but uses a separate Tailwind/Lucide visual system. Rebuild the UI only; keep the existing finance Firebase/core logic. fileciteturn64file0

### Current Account
`account.html` contains useful identity/role/logout behavior. Rebuild the presentation as a small V7 Account module. Keep admin access hidden from normal farmer navigation. fileciteturn65file0

### Navigation
Replace the five-item V6 navigation with four farmer-facing modules:
1. Home
2. Watering
3. Finance
4. Account

Settings and OTA must not appear in the normal farmer UI.

## REMOVE FROM FARMER UI

- `settings.html` as a normal navigation destination
- `ota.html` as a normal navigation destination
- hardware pin maps
- MQTT credential management
- developer/debug controls
- Firebase technical settings
- duplicate navigation implementations
- page-specific visual themes

The existing settings page is explicitly an admin/settings surface and exposes MQTT/hardware information; it should remain outside the farmer shell rather than be presented as a primary feature. fileciteturn66file0

The existing OTA page is an engineering/admin surface and should not be a farmer-facing menu item. fileciteturn67file0

## V7 target structure

```text
v7/
├── index.html
├── assets/
│   ├── css/
│   │   ├── app.css
│   │   ├── components.css
│   │   └── responsive.css
│   └── js/
│       ├── app.js
│       ├── navigation.js
│       ├── auth.js
│       ├── mqtt.js
│       ├── weather.js
│       ├── watering.js
│       └── finance.js
└── modules/
    ├── home/
    ├── watering/
    ├── finance/
    └── account/
```

The first V7 implementation should be created beside V6, then switched into production only after QA. This avoids breaking the current firmware/dashboard while the replacement is being built.

## V7 UI rules

- Mobile-first.
- One design system across every module.
- Large touch targets for outdoor use.
- High contrast in sunlight.
- No technical hardware details on normal screens.
- Clear online/offline state.
- Weather and Rain Protection visible on Home and Watering.
- Auto Watering must remain blocked when weather data is invalid/unavailable.
- Finance remains accessible from the main navigation.

## Critical security finding

`config.js` currently contains an MQTT username/password in repository source. This conflicts with the documented security policy that browser MQTT credentials should not be committed. The credentials must be rotated and removed from source before V7 production. Do not copy them into the V7 code. fileciteturn60file0

This is a security remediation item, not a UI refactor. The new V7 client must receive credentials through the approved runtime/session mechanism or another secured broker architecture.

## Firmware constraint

The latest documented firmware build uses about 94% IRAM. V7 must not add firmware features merely to support the new UI unless necessary; keep the Dashboard changes on the web side wherever possible. fileciteturn55file0

## Migration order

1. Freeze V6 production behavior.
2. Create V7 shell and design system.
3. Implement Home.
4. Implement Watering + Rain Protection.
5. Implement Finance using existing Firebase data.
6. Implement Account/auth.
7. Add four-item navigation.
8. Add automated smoke tests for all V7 modules.
9. Run CI and browser/mobile QA.
10. Only then make V7 the production entry point.
11. Archive/remove obsolete farmer-facing V6 pages after successful cutover.

## Acceptance criteria

V7 is ready only when:

- Home, Watering, Finance and Account look like one application.
- No Settings/OTA appears in farmer navigation.
- Finance data remains intact and editable.
- Existing MQTT relay commands still work.
- Existing schedules remain compatible with ESP8266.
- AUTO is blocked by Rain Protection and by weather API failure.
- Authentication and role protection remain intact.
- No MQTT secret is committed to the repository.
- Firmware source and MQTT contract remain backward compatible.
- Dashboard smoke tests pass.
- Firmware CI remains green.
