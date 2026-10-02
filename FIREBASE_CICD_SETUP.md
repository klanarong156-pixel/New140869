# ตั้งค่า CI/CD สำหรับ Smart Farm Dashboard บน Firebase Hosting

## สิ่งที่ workflow ทำ

`.github/workflows/validate.yml` มี job ตรวจ Dashboard/Firmware/Firebase ก่อน และเพิ่ม job `deploy-hosting` ซึ่งจะทำงานต่อเมื่อการตรวจทั้งหมดผ่าน และเป็น push เข้า `main` เท่านั้น จากนั้น deploy เฉพาะ Firebase Hosting project `smart-farm-platfor` ไปยัง channel `live` ที่ `https://smart-farm-platfor.web.app`.

- Push หรือ pull request ไป branch อื่น: รันการตรวจ แต่ไม่ deploy production
- Pull request: ไม่มี Firebase preview deployment เพื่อไม่ให้การทดสอบไปแตะ backend/MQTT ของระบบจริง
- Push/merge เข้า `main`: ถ้าการตรวจผ่าน จะ deploy Hosting อัตโนมัติ
- Database Rules workflow ยังคงแยกจาก Hosting และ deploy ตาม path filter เดิม

## ต้องเพิ่ม GitHub Secret ก่อน merge

Workflow ใช้ service account สำหรับ Hosting แยกจากบัญชีผู้ใช้ และอ้างอิง GitHub **repository secret** ชื่อนี้:

```text
FIREBASE_SERVICE_ACCOUNT_SMART_FARM_PLATFOR
```

ขั้นตอนสำหรับผู้ดูแล Firebase/GitHub:

1. ใน Google Cloud Console ของ project `smart-farm-platfor` สร้าง service account เฉพาะสำหรับ deploy Hosting เช่น `github-hosting-deploy` และให้ role ที่จำเป็นสำหรับ Hosting deployment เท่านั้น เช่น **Firebase Hosting Admin** ไม่ควรใช้ Owner/Editor หากไม่จำเป็น
2. สร้างและดาวน์โหลด JSON key ของ service account
3. เปิด GitHub repo `klanarong156-pixel/New140869` → **Settings → Secrets and variables → Actions → New repository secret**
4. ตั้งชื่อ secret เป็น `FIREBASE_SERVICE_ACCOUNT_SMART_FARM_PLATFOR` และใส่เนื้อหา JSON ทั้งก้อนเป็นค่า secret
5. ห้าม commit ไฟล์ key ลง repo, ห้ามวาง key ใน issue/แชต และลบสำเนา JSON ที่ดาวน์โหลดไว้เมื่อบันทึก secret แล้ว
6. Merge PR เข้า `main` หลัง secret พร้อมแล้ว จากนั้นดูสถานะได้ที่ **Actions**; deploy จะเริ่มหลัง job `Dashboard, firmware, and Firebase checks` ผ่าน

> ในการเตรียม workflow นี้ GitHub integration ปัจจุบันตอบกลับ 403 สำหรับการจัดการ Actions secrets จึงไม่สามารถสร้าง secret แทนเจ้าของ repo ได้อย่างปลอดภัย ต้องให้ผู้ดูแลเพิ่ม secret ผ่าน GitHub Settings เอง

## ความปลอดภัยและการดูแล

- Workflow deploy เฉพาะ `hosting`; ไม่ deploy Database Rules หรือ Cloud Functions
- ใช้ secret ระดับ repo; GitHub จะส่งค่าให้เฉพาะ workflow ตอนทำงาน และ log จะแสดงเพียงว่ามีการตั้งค่า ไม่พิมพ์ค่า secret
- หากต้องการลดการใช้กุญแจ JSON ระยะยาวในอนาคต สามารถย้ายไป Workload Identity Federation ได้ โดยต้องตั้งค่า Identity Provider และ IAM binding ใน Google Cloud ก่อน
- ตั้ง branch protection ให้ `main` รับการเปลี่ยนผ่าน PR และกำหนด check `Validate Smart Farm integration / Dashboard, firmware, and Firebase checks` เป็น required เพื่อกันการข้ามการทดสอบ
- ไม่มี auto-deploy จาก pull request เพราะ Dashboard เชื่อมต่อทรัพยากร Firebase/MQTT จริง
