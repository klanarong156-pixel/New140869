# Unified Smart Farm Dashboard

The canonical application is `dashboard/index.html`. It contains the overview, relay controls, device diagnostics, MQTT setup, weather, Firebase finance, Firebase-only schedule planning, and the direct ESP pump-schedule command in one route-driven page. Internal navigation uses the same HTML document, so page changes do not instantiate a second MQTT client.

## Important distinctions

- **ESP schedule** (`smartfarm/schedule/pump/set`): sends a non-retained command directly to the ESP8266. It may cause the pump to start immediately if the device is in AUTO and the active window applies. The form requires a fresh ESP heartbeat, an active MQTT connection, and a confirmation.
- **Firebase plan** (`users/<uid>/controlRoomSchedules`): a saved planning record only. It is not synchronized to or executed by the ESP8266. The UI says this next to the form.
- **Finance and cucumber sales** use the existing account-scoped Firebase APIs. Signing in from the finance route unlocks them for the same page session.
- The former Control Room and standalone finance pages now redirect into the canonical Dashboard. The prototype repository's former `smart-farm-pl` entry is archived and redirects to the canonical public app.

## Migration caution

The old `smart-farm-pl` prototype stored its lightweight finance entries in that browser's local storage. These are not silently imported or deleted. Users should export/record any old entries before replacing the prototype, then enter them into the authenticated Finance view. Cloud Firebase finance and cucumber-sale records remain under their existing account.

## Verification performed

- Node contract/smoke checks: Dashboard MQTT, firmware contract, route/layout, and unified-dashboard tests pass.
- HTTP route audit: all 82 route/navigation checks pass.
- Chromium viewport audit: all 96 route × viewport combinations pass (320–1280 px), with no browser console errors, page exceptions, or failed requests.
- Browser flow with mocked MQTT/Firebase: the legacy Control Room redirect, single MQTT client, retained-heartbeat interlock, direct ESP schedule payload, Firebase-only sign-in gate, and in-app Finance route pass.
- This verifies UI contracts only; it does not validate relay wiring, pump operation, real credentials, or the production Firebase/MQTT configuration.

## Release caution

This change only updates the checked-out source. It has **not** been pushed, published to Firebase Hosting, or deployed to the prototype host. Verify the hardware command contract, account access, Firebase rules, responsive layout, and real ESP status before deploying. Do not treat a successful local/browser test as proof of safe pump wiring or relay behavior.
