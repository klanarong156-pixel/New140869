# CI/CD สำหรับ Smart Farm Dashboard บน Firebase

## การทำงานของ workflow

ไฟล์ `.github/workflows/validate.yml` รันทดสอบ Dashboard, firmware และ Firebase เมื่อมี push หรือ pull request โดย job `deploy-hosting` จะทำงานเฉพาะเมื่อเป็น push เข้า `main` และ job ตรวจสอบทั้งหมดผ่าน จากนั้น deploy **Firebase Hosting เท่านั้น** ไปยัง project `smart-farm-platfor` และ live URL `https://smart-farm-platfor.web.app`.

- Push หรือ pull request ไป branch อื่น: รันทดสอบ แต่ไม่ deploy production
- Pull request: ไม่มี Hosting preview deployment เพื่อไม่ให้การทดสอบไปแตะ backend/MQTT จริง
- Push/merge เข้า `main`: หลัง job ตรวจสอบผ่าน จะ deploy Hosting อัตโนมัติ
- PR #20 ยังแก้ `firebase.rules.json` ด้วย จึงมีอีก workflow แยกต่างหาก: หลัง merge เข้า `main` แล้ว `Firebase CI` จะทดสอบ Rules และ deploy Realtime Database Rules เมื่อ emulator tests ผ่าน

## Credential ที่ผู้ดูแลต้องตรวจให้พร้อมก่อน merge

### 1. GitHub repository secret สำหรับ Firebase Hosting

ชื่อ secret ที่ workflow ใช้:

```text
FIREBASE_SERVICE_ACCOUNT_SMART_FARM_PLATFOR
```

ผู้ดูแล Firebase/GitHub ต้องสร้าง service account สำหรับ deploy Hosting โดยให้สิทธิ์เท่าที่จำเป็น (เช่น Firebase Hosting Admin), สร้าง JSON key แล้วเพิ่มเนื้อหา JSON ทั้งก้อนที่ GitHub repo `klanarong156-pixel/New140869` → **Settings → Secrets and variables → Actions → New repository secret** โดยใช้ชื่อ secret ข้างต้น ห้าม commit หรือส่งไฟล์/ค่า key ผ่าน issue หรือแชต และควรลบไฟล์ key ที่ดาวน์โหลดหลังบันทึก secret แล้ว

### 2. GitHub environment secret สำหรับ Realtime Database Rules

เพราะ PR นี้มีการแก้ `firebase.rules.json` การ merge จะเรียก job `Deploy Realtime Database Rules` ใน `.github/workflows/firebase-ci.yml` ด้วย workflow เดิมซึ่งต้องมี secret:

```text
Environment: production
Secret: FIREBASE_TOKEN
```

ผู้ดูแลต้องตรวจหรือสร้าง GitHub environment ชื่อ `production` แล้วเพิ่ม environment secret `FIREBASE_TOKEN` ที่ **Settings → Environments → production → Environment secrets** ตามวิธี credential ที่องค์กรใช้กับ Firebase CLI ปัจจุบัน workflow จะหยุดที่ขั้นตรวจ secret หากไม่มีค่านี้ และจะไม่พยายาม deploy Rules ต่อ

> เครื่องมือนี้อ่าน GitHub Actions secrets ไม่ได้ (GitHub API ตอบ 403) และ endpoint ของ environment `production` ตอบ 404 จึง **ยืนยันไม่ได้** ว่า secret ทั้งสองมีอยู่แล้วหรือไม่ กรุณาให้ repo/Firebase admin ตรวจด้วยตนเอง อย่าส่งค่า secret หรือ JSON key ในแชต

## การเปิดใช้งาน

1. ให้ผู้ดูแลตรวจและตั้งค่า secrets ทั้งสองรายการข้างต้นในตำแหน่งที่ถูกต้อง
2. ตรวจว่า GitHub Actions ของ PR #20 ผ่าน และ deploy jobs เป็น skipped ตามปกติบน pull request
3. เมื่อพร้อม ให้ merge PR #20 เข้า `main`; การ push เข้า `main` จะเริ่ม Hosting deploy อัตโนมัติหลัง integration checks ผ่าน และ Rules workflow จะแยกทดสอบ/จัดการ deployment ตามเงื่อนไขของมัน
4. ติดตามผลจากแท็บ **Actions** ของ repository; หาก credential ขาด job จะรายงานชื่อ secret ที่ต้องตั้งค่าโดยไม่พิมพ์ค่า secret

## สถานะการทดสอบและความปลอดภัย

- Firebase Rules Emulator ผ่าน 20/20 กรณี รวมการยืนยันว่า field ที่ไม่อยู่ใน whitelist ถูกปฏิเสธ
- GitHub Actions ล่าสุดของ PR ผ่าน 6 checks; production deploy jobs ถูก skip เพราะ PR ยังไม่ merge
- Workflow ของ Hosting ใช้ `FIREBASE_SERVICE_ACCOUNT_SMART_FARM_PLATFOR` และ deploy เฉพาะ `hosting`; workflow Rules ใช้ `production/FIREBASE_TOKEN` และ deploy เฉพาะ Database Rules
- แนะนำจำกัด service account ให้มีสิทธิ์ขั้นต่ำ และจำกัด environment `production` ให้ deploy ได้จาก `main` เท่านั้น
- ในอนาคตสามารถย้ายจาก long-lived JSON key/CLI token ไป Workload Identity Federation ได้ โดยต้องตั้งค่า IAM และ identity provider ใน Google Cloud ก่อน
