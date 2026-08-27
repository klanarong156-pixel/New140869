# Archived Smart Farm files

โฟลเดอร์นี้เก็บไฟล์ legacy และรายงาน migration รอบก่อนเพื่ออ้างอิงย้อนหลังเท่านั้น ไฟล์ภายในไม่ได้ถูกโหลดโดยหน้า Dashboard/PWA รุ่นปัจจุบัน และอาจมีชื่อรุ่น, AUTO/MANUAL contract หรือ safety policy ที่ไม่ตรงกับ Firmware ปัจจุบัน

สำหรับการใช้งานจริง ให้ยึด `README.txt`, `SYSTEM_VERSION.txt`, `MQTT_CONTRACT_V6.md`, `HARDWARE_V6.md` และ `BUILD_STATUS.txt` ที่ root repository เท่านั้น

**นโยบายปั๊มปัจจุบัน:** ไม่มี forced cutoff 30 นาที และไม่มี automatic MQTT-loss cutoff; ปั๊มทำงานตามตารางหรือคำสั่งที่ผู้ใช้เลือก พร้อม Emergency Stop software latch และ physical protective hardware ที่ต้องติดตั้ง/ทดสอบแยกกัน
