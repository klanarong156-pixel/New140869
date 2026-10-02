# เตรียม Deploy Smart Farm Dashboard ขึ้น Firebase Hosting

## สถานะที่ตรวจสอบ

- Project alias ใน `.firebaserc`: `smart-farm-platfor` (ตั้งเป็น `default`)
- Firebase Hosting ตั้ง `public` เป็น repository root (`.`) จึงต้องควบคุมรายการไฟล์ด้วย `hosting.ignore` ใน `firebase.json`
- เพิ่ม Hosting exclusions สำหรับ firmware `.ino`/`.bin`/`.elf`, archive, tools, tests, ตัวอย่าง, CI และเอกสาร build เพื่อไม่ให้ไฟล์เหล่านี้ถูกเผยแพร่พร้อมเว็บ
- `.firebaseignore` แยกต่างหาก **ไม่ใช่** รายการ ignore ที่ Firebase Hosting ใช้เลือกไฟล์; Hosting อ่าน `hosting.ignore` จาก `firebase.json` ตาม [เอกสาร Firebase Hosting](https://firebase.google.com/docs/hosting/full-config)
- คำสั่ง `firebase deploy --only hosting` จะ deploy Hosting เท่านั้น ไม่ deploy Realtime Database Rules หรือ Functions ตาม [Firebase CLI docs](https://firebase.google.com/docs/cli)
- ตรวจแล้วว่า `npx --yes firebase-tools@latest` เรียก Firebase CLI `15.32.1` ได้ แต่ `login:list` รายงานว่าไม่มีบัญชีที่ authorized จึงยังยืนยัน Hosting Sites/สิทธิ์ของ project ไม่ได้ และ **ยังไม่ได้ deploy**
- จำลองการกรองไฟล์ตาม Hosting ignore แล้วพบว่าไฟล์ firmware, archive และ tools ถูกกันออก; ตรวจลิงก์ asset ใน HTML 243 รายการแล้วไม่พบไฟล์ที่อ้างอิงหาย การจำลองนี้ไม่ใช่รายการอัปโหลดที่ Firebase CLI สร้างจริง
- GitHub Actions ที่ตรวจพบ deploy Realtime Database Rules แยกต่างหากเมื่อ push/dispatch บน `main`; คำสั่งด้านล่างจำกัดเฉพาะ Hosting และไม่ได้ push โค้ด
- การเปลี่ยนแปลงใน repository ยังอยู่ใน working tree ในเครื่อง; คำสั่ง deploy ใช้ไฟล์ใน working tree ณ เวลาที่รัน ไม่ได้ดึงโค้ดจาก GitHub อัตโนมัติ

## 1) ตรวจและทดสอบโค้ดก่อน

เปิด terminal ใน repository `New140869` แล้วรัน:

```bash
cd /path/to/New140869

git diff --check
node dashboard-contract-test.mjs
node firmware-v720-contract-test.mjs
node dashboard-layout-audit.mjs
node dashboard-smoke-test.mjs
node tools/unified-dashboard-contract-test.mjs
node e2e-navigation-test.mjs
```

ตรวจไฟล์ใน Hosting ignore อีกครั้งก่อน deploy:

```bash
node -e "console.log(JSON.stringify(require('./firebase.json').hosting, null, 2))"
git status --short
```

## 2) ตรวจบัญชีและ Hosting Site

ใช้ terminal บนเครื่องที่มี browser และเข้าสู่ระบบ Firebase ได้:

```bash
npx --yes firebase-tools@latest login
npx --yes firebase-tools@latest projects:list
npx --yes firebase-tools@latest hosting:sites:list --project smart-farm-platfor
```

ตรวจว่า project ที่เลือกคือ `smart-farm-platfor` และ site/domain ที่ต้องการจริงก่อนดำเนินการ ถ้ารันบนเครื่อง remote ที่ไม่มี browser/localhost callback ให้ดูวิธี `login --no-localhost` ใน Firebase CLI docs

## 3) ทางเลือก: Preview Channel ก่อน Production

คำสั่งนี้เผยแพร่ **preview URL ชั่วคราว** ไม่ใช่ production site แต่ยังเป็นการอัปโหลดเนื้อหาออกไปยัง Firebase:

```bash
npx --yes firebase-tools@latest hosting:channel:deploy dashboard-preflight \
  --project smart-farm-platfor \
  --expires 1d
```

ตรวจหน้าแรก, ระบบน้ำ, การเงินหลัง login, legacy redirects, MQTT credentials, การแสดงสถานะ online/offline และ Firebase plan ก่อนค่อยเลือก production deploy

## 4) Production deploy — ยังไม่ได้รัน

เมื่อยืนยัน project/site และผ่านการตรวจ Preview แล้ว ใช้คำสั่งนี้:

```bash
npx --yes firebase-tools@latest deploy \
  --only hosting \
  --project smart-farm-platfor \
  --message "Unified Smart Farm Dashboard"
```

อย่าตัด `--only hosting` ออก เพราะ `firebase.json` ยังมี config ของ Database และ Functions อยู่ การ deploy แบบไม่มี `--only` อาจพยายาม deploy บริการอื่นด้วย

หลัง deploy ให้เปิด URL ของ Hosting Site ที่ยืนยันไว้ และตรวจใน Firebase Console > Hosting > Release history หากต้อง rollback ให้ย้อนกลับ release ก่อนหน้าใน Console

## หมายเหตุด้านข้อมูล

ข้อมูล Finance เดิมจาก prototype `smart-farm-pl` ที่เก็บใน browser Local Storage ไม่ได้ migrate เข้า Firebase อัตโนมัติ ควรเก็บข้อมูลเดิมก่อนเลิกใช้หน้า prototype
