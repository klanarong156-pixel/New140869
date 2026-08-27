# Firebase V7.1 Security Setup · สวนลุงนะ Smart Farm

## 1. Firebase Console
1. Open Firebase Console and select project `smart-farm-platfor`.
2. **Authentication → Sign-in method → Email/Password → Enable**.
3. **Realtime Database → Create database** in `asia-southeast1`.
4. Paste `firebase.rules.json` into **Realtime Database → Rules** and publish.
5. **Project settings → Your apps → Web app**. The Firebase Web API key may remain in the frontend; it is not a database password.

## 2. Roles
The web app creates a new account as `user` automatically.

To bootstrap the first administrator, after that account signs up:
1. Open Realtime Database → Data.
2. Find `roles/<Firebase UID>`.
3. Set `role` to `admin`.
4. Sign out/in on the web app.

After the first admin exists, the **Admin** page can change other accounts between `user` and `admin`.

Role permissions:
- `user`: Dashboard, Relay control and four-slot schedules.
- `admin`: all user permissions + MQTT settings, role management and OTA.

## 3. Data isolation
Each authenticated account is isolated at:

```text
users/
  <Firebase UID>/
    farm/
    finance/
roles/
  <Firebase UID>/
    role: user|admin
```

## 4. MQTT security
MQTT credentials must not be committed to GitHub Pages source code.

The dashboard asks for MQTT credentials at runtime and stores them locally in the browser. If an old MQTT password was ever exposed, rotate/revoke it in HiveMQ Cloud.

For production security, configure HiveMQ ACLs/credentials so each client can only use the required topics. A static GitHub Pages application cannot keep a shared MQTT password secret from a determined browser user.

## 5. Production checklist
- Publish the Firebase rules before using role management.
- Verify the first admin account manually.
- Verify user cannot open admin/settings/OTA pages.
- Verify admin can manage roles.
- Verify ESP8266 and dashboard use the same MQTT contract.
- Test all four schedule slots independently for every relay.
- ทดสอบว่าปั๊มทำงานตามตาราง/คำสั่งที่ผู้ใช้เลือก โดยไม่มี hard cutoff 30 นาทีหรือ MQTT-loss cutoff ที่ไม่ได้สั่ง และติดตั้ง physical E-stop/contactor แยกต่างหากก่อนใช้งานจริง
- Do not commit Firebase service-account keys, MQTT passwords, OTA passwords or private keys.
