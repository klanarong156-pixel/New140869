# ผลตรวจสอบเฟิร์มแวร์ด้านเวลา

- เฟิร์มแวร์ใช้ `NTPClient ntp(udp, "pool.ntp.org", TZ_OFFSET_SECONDS, 60000UL)` และกำหนด UTC+07:00 ถูกต้องสำหรับประเทศไทย
- มี `syncRTCFromNTP()` ซึ่งอัปเดต DS3231 เมื่อ Wi-Fi เชื่อมต่อ โดยตรวจสอบ epoch และอ่าน RTC กลับหลังปรับเวลาแล้ว
- `scheduleClockMinutes()` ให้ความสำคัญกับ DS3231 ก่อน และใช้ NTP เป็น fallback เมื่อ RTC ใช้ไม่ได้
- `currentDateString()` และ heartbeat ใช้ RTC ก่อน แล้ว fallback ไป NTP เช่นเดียวกัน
- `setup()` เรียก `ntp.begin()` ก่อนซิงค์ และ `loop()` เรียก `ntp.update()` กับ `syncRTCFromNTP(false)` เมื่อ Wi-Fi เชื่อมต่อ
- จุดที่ควรปรับปรุงคือเพิ่มความชัดเจนของสถานะ NTP ว่าเคย sync สำเร็จแล้วหรือไม่, เพิ่ม NTP server สำรอง, ไม่ถือค่า `getEpochTime()` ที่อาจเป็นค่าเก่าหรือยังไม่ sync ว่าเป็นเวลาปัจจุบันโดยอัตโนมัติ และรายงานสถานะ clock source ใน heartbeat ให้หน้าเว็บแยกได้ชัดเจน
- โค้ดมีไฟล์ `SmartFarm_V6_PRODUCTION.ino` และระบบทดสอบเชิง static/regression แต่ไม่พบ PlatformIO/Arduino CLI ใน repo สำหรับคอมไพล์จริงภายใน sandbox
