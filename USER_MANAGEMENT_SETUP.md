# Smart Farm User Management

หน้านี้ใช้จัดการบัญชี Firebase Authentication ผ่าน Firebase Functions ที่ตรวจสิทธิ์ Admin ก่อนทุกคำสั่ง โดยหน้าเว็บยังคง deploy เป็น Static GitHub Pages ได้ตามเดิม

## ความสามารถ

ระบบรองรับการแสดงรายชื่อผู้ใช้, ค้นหา email/UID/role, เปลี่ยนบทบาท `user` หรือ `admin`, ระงับและเปิดใช้งานบัญชี, สร้างลิงก์รีเซ็ตรหัสผ่าน และลบบัญชีพร้อมป้องกันการลบ Admin คนสุดท้ายหรือบัญชีที่กำลังใช้งานอยู่

## การติดตั้งครั้งแรก

ต้องติดตั้ง Firebase CLI และเข้าสู่ระบบด้วยบัญชีที่มีสิทธิ์จัดการ Firebase project ก่อน จากโฟลเดอร์ repository ให้รัน:

```bash
npm install --prefix functions
firebase login
firebase use smart-farm-platfor
firebase deploy --only functions
```

ถ้า project ยังไม่เปิดใช้งาน Cloud Functions ระบบอาจขอให้เปิดใช้งาน billing plan ของ Firebase ก่อน การใช้ Firebase Authentication และ Realtime Database ที่มีอยู่เดิมไม่ต้องเปลี่ยน และห้ามนำ Service Account Key มาใส่ในไฟล์หน้าเว็บ

## กำหนด Admin คนแรก

บัญชีที่สมัครใหม่จะมี role เป็น `user` เสมอ ให้สร้างบัญชีผ่านหน้าเข้าสู่ระบบก่อน แล้วนำ Firebase Auth UID ไปสร้างหรือแก้ข้อมูลที่ Realtime Database path `roles/<UID>` เป็น:

```json
{
  "role": "admin",
  "email": "admin@example.com"
}
```

จากนั้นออกจากระบบและเข้าสู่ระบบใหม่ แล้วเปิด `admin.html#user-management`

## การตรวจสอบความปลอดภัย

Callable functions ทุกตัวตรวจสอบ Firebase ID token และอ่าน `roles/<caller UID>/role` จากฐานข้อมูลฝั่ง server ก่อนดำเนินการ ผู้ใช้ทั่วไปจึงไม่สามารถเรียก list, เปลี่ยน role, disable, reset หรือ delete ผู้ใช้ได้ หน้าเว็บไม่รับหรือเก็บรหัสผ่านของผู้ใช้ และคำสั่งที่มีผลถาวรจะมีการยืนยันซ้ำใน UI

ระบบป้องกันการลดสิทธิ์, ระงับ หรือ ลบ Admin คนสุดท้าย รวมถึงป้องกัน Admin ลบบัญชีตัวเองหรือระงับบัญชีที่กำลังใช้งานอยู่ การเปลี่ยน role และการดำเนินการสำคัญถูกบันทึกที่ `userManagementAudit`

## การทดสอบ

รันจากโฟลเดอร์ repository:

```bash
node --check functions/index.js
node --check user-management.js
node dashboard-smoke-test.mjs
```

ก่อนใช้งานจริงควรทดสอบด้วยบัญชี Admin และบัญชี user แยกกัน โดยยืนยันว่าบัญชี user ถูกปฏิเสธที่ backend ไม่ใช่เพียงถูกซ่อนเมนูหน้าเว็บ
