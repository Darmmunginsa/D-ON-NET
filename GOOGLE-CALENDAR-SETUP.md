# Google Calendar ส่วนตัวบนปฏิทินคิวงาน

ฟีเจอร์นี้อ่านช่วงไม่ว่างของปฏิทินหลัก (`primary`) ของบัญชีที่เลือกผ่าน Google OAuth โดยขอเฉพาะ `calendar.freebusy` ไม่อ่านชื่อ/เนื้อหานัด และไม่เขียนหรือเลื่อนนัดใน Google Calendar

## เปิดใช้งาน Google Cloud

1. เลือกโปรเจกต์ Google Cloud ที่เป็นเจ้าของ OAuth Client ID ใน `CONFIG.googleClientId` ของ SalePro
2. APIs & Services → Library → เปิด **Google Calendar API**
3. Google Auth Platform → Data Access → เพิ่ม scope `https://www.googleapis.com/auth/calendar.freebusy` ตามการตั้งค่าโปรเจกต์
4. ตรวจ Audience: ถ้าใช้บัญชี Gmail ส่วนตัว โปรเจกต์ต้องอนุญาต External และถ้าอยู่สถานะ Testing ให้เพิ่มบัญชีที่ใช้เป็น Test user ด้วย บัญชีภายนอกเข้าไม่ได้เมื่อ Audience เป็น Internal
5. OAuth web client ต้องมี JavaScript origin ที่เปิดระบบจริง เช่น `https://darmmunginsa.github.io` (ใช้ origin ไม่ใส่ path)
6. เปิดหน้าปฏิทินคิวงาน → **เชื่อม Google Calendar ส่วนตัว** → เลือกบัญชี → อนุญาตสิทธิ์

ใช้ OAuth client เดิม ไม่มี Client secret ในหน้าเว็บ และไม่ต้อง Deploy Apps Script เพิ่ม

## พฤติกรรม

- ช่วงไม่ว่างแสดงสีเทาในปฏิทินและรายละเอียดวันนั้น เป็นข้อมูลเฉพาะตัวเองในแท็บ/รอบใช้งานนี้ ไม่ส่งไป Google Sheet, Worker, AI วิเคราะห์เส้นทาง หรือให้ทีมงานคนอื่นเห็น
- ไม่รวมปฏิทินรอง/ปฏิทินที่แชร์ และรายการที่ตั้งใน Google Calendar เป็น Free จะไม่เป็นช่วงไม่ว่าง
- ซ่อน/แสดงด้วยตัวกรอง “ไม่ว่าง · Google ส่วนตัว” การซ่อนไม่ปิดการเตือนซ้อนเวลา
- เปลี่ยนเดือนจะโหลดช่วงไม่ว่างเดือนนั้น กดโหลดช่วงไม่ว่างใหม่เพื่ออัปเดตการแก้ไขจาก Google Calendar
- ก่อนยืนยัน/เลื่อนคิวจะตรวจช่วงไม่ว่างล่าสุดของผู้เชื่อมต่อ เมื่อทับกันให้ผู้ใช้ยืนยัน ไม่เปลี่ยนคิวเอง ถ้าไม่ระบุระยะเวลางานแต่วันนั้นมีช่วงไม่ว่าง จะแจ้งให้ตรวจสอบก่อน
- ตรวจระยะเวลางานที่กรอก ไม่รวมเวลาเดินทาง และไม่ได้ตรวจปฏิทินส่วนตัวของช่างทุกคน
- อ่าน Calendar ไม่ได้หรือสิทธิ์หมดอายุจะบอกข้อผิดพลาด ไม่แปลว่า “ว่าง” ผู้ใช้เชื่อมใหม่หรือตัดการเชื่อมต่อเพื่อใช้ระบบคิวเดิม
- Token และช่วงไม่ว่างอยู่ในหน่วยความจำเท่านั้น โหลดหน้าใหม่/ออกจากระบบ/ตัดการเชื่อมต่อแล้วต้องเชื่อมใหม่ ปุ่มตัดการเชื่อมต่อล้างข้อมูลในแอป ไม่ใช่การถอน OAuth grant ในบัญชี Google

เอกสารอ้างอิง: https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query และ https://developers.google.com/identity/oauth2/web/guides/use-token-model
